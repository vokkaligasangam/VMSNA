/**
 * Daily reconciliation, and the one-off grandfathering pass.
 *
 * Webhooks are the fast path; this is the correct one. It pulls authoritative
 * state from Stripe for every member with a subscription and repairs Firestore
 * where they disagree — which is what makes a webhook outage a delay rather
 * than a member losing access.
 *
 * It is also the only thing that downgrades anybody. No single webhook event
 * ever revokes access; only this job does, and only after the grace period.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { STRIPE_SECRET_KEY, stripe, siteOrigin } from "./config.js";
import { requireAdmin, ChunkedWriter } from "../lib/admin.js";
import { layout, send } from "../lib/mailer.js";

const DAY = 86_400_000;

function tsFrom(seconds?: number | null) {
  return seconds ? admin.firestore.Timestamp.fromMillis(seconds * 1000) : null;
}

export const reconcileSubscriptions = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "America/Los_Angeles",
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY, "GMAIL_APP_PASSWORD"],
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const report = { checked: 0, repaired: 0, expired: 0, remindersSent: 0, errors: 0 };

    const snap = await db.collection("membershipApplications").where("status", "==", "approved").get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const membership = data.membership ?? {};
      report.checked++;

      try {
        // 1. Repair from Stripe where a subscription exists.
        if (data.stripeSubscriptionId) {
          const sub = await stripe().subscriptions.retrieve(data.stripeSubscriptionId);
          const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
          const truth =
            sub.status === "active" || sub.status === "trialing"
              ? "active"
              : sub.status === "past_due" || sub.status === "unpaid"
                ? "past_due"
                : sub.status === "canceled"
                  ? "grace"
                  : "none";

          if (membership.state !== truth) {
            logger.warn(
              `Drift for ${data.userId}: Firestore says "${membership.state}", Stripe says "${truth}"`,
            );
            await doc.ref.update({
              "membership.state": truth,
              "membership.currentPeriodEnd": tsFrom(item?.current_period_end),
              "membership.cancelAtPeriodEnd": sub.cancel_at_period_end === true,
              "membership.reconciledAt": admin.firestore.FieldValue.serverTimestamp(),
            });
            report.repaired++;
          }
        }

        // 2. Expire anyone whose grace period has run out. The only downgrade.
        const graceEnds = membership.graceEndsAt?.toMillis?.();
        if (membership.state === "grace" && graceEnds && graceEnds < now) {
          await doc.ref.update({
            "membership.state": "expired",
            "membership.expiredAt": admin.firestore.FieldValue.serverTimestamp(),
          });
          report.expired++;

          if (data.email) {
            await send({
              to: data.email,
              subject: "Your VMSNA membership has lapsed",
              html: layout(
                "Your membership has lapsed",
                `<p style="font-size:15px;line-height:1.6">Your VMSNA membership has come to an end and the member directory is no longer available to you. Nothing has been deleted — renewing puts everything back exactly as it was.</p>`,
                { href: `${siteOrigin()}/membership/activate/`, label: "Renew your membership" },
              ),
            });
          }
        }

        // 3. Renewal reminders at 30, 7 and 1 days.
        const endsAt = membership.currentPeriodEnd?.toMillis?.();
        if (membership.state === "active" && endsAt && !membership.cancelAtPeriodEnd) {
          const daysLeft = Math.ceil((endsAt - now) / DAY);
          const lastSent = membership.reminderSentFor;
          if ([30, 7, 1].includes(daysLeft) && lastSent !== daysLeft && data.email) {
            await send({
              to: data.email,
              subject:
                daysLeft === 1
                  ? "Your VMSNA membership renews tomorrow"
                  : `Your VMSNA membership renews in ${daysLeft} days`,
              html: layout(
                "Membership renewal",
                `<p style="font-size:15px;line-height:1.6">Your membership renews automatically on ${new Date(endsAt).toDateString()}. No action is needed — this is just so it is not a surprise on your statement.</p>`,
                { href: `${siteOrigin()}/account/billing/`, label: "Manage your membership" },
              ),
            });
            await doc.ref.update({ "membership.reminderSentFor": daysLeft });
            report.remindersSent++;
          }
        }
      } catch (error) {
        report.errors++;
        logger.error(`Reconcile failed for ${doc.id}`, error);
      }
    }

    logger.info("reconcileSubscriptions", report);
  },
);

/**
 * Grandfather every existing approved member before payment enforcement is
 * switched on.
 *
 * This must run, and be verified, BEFORE ENFORCE_MEMBERSHIP_PAYMENT is set to
 * true. In the other order roughly 500 people lose the member directory at the
 * same moment. Dry-run by default.
 */
export const grandfatherMemberships = onCall(
  { region: "us-central1" },
  async (request) => {
    requireAdmin(request);
    const dryRun = request.data?.dryRun !== false;
    // Default: complimentary through the end of the next full fiscal year, so
    // nobody is asked to pay mid-cycle for something they already had.
    const until = request.data?.until
      ? new Date(String(request.data.until))
      : new Date(new Date().getFullYear() + 1, 11, 31);

    const db = admin.firestore();
    const snap = await db.collection("membershipApplications").where("status", "==", "approved").get();

    const report = {
      dryRun,
      approved: snap.size,
      alreadyPaying: 0,
      alreadyGrandfathered: 0,
      wouldGrandfather: 0,
      complimentaryUntil: until.toISOString().slice(0, 10),
      written: 0,
    };

    const writer = new ChunkedWriter(db);

    for (const doc of snap.docs) {
      const m = doc.data().membership ?? {};
      if (m.state === "active") {
        report.alreadyPaying++;
        continue;
      }
      if (m.grandfathered === true) {
        report.alreadyGrandfathered++;
        continue;
      }
      report.wouldGrandfather++;

      if (!dryRun) {
        await writer.set(
          doc.ref,
          {
            membership: {
              ...m,
              state: "complimentary",
              grandfathered: true,
              compReason: "Member before paid membership was introduced",
              currentPeriodEnd: admin.firestore.Timestamp.fromDate(until),
              startedAt: m.startedAt ?? admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
      }
    }

    if (!dryRun) {
      await writer.flush();
      report.written = writer.total;
      await db.collection("adminAudit").add({
        action: "membership.grandfather",
        count: report.wouldGrandfather,
        until: until.toISOString(),
        by: request.auth?.token.email ?? "unknown",
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    logger.info("grandfatherMemberships", report);
    return report;
  },
);
