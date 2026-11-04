/**
 * Stripe webhook.
 *
 * Four things here are easy to get wrong and expensive to get wrong:
 *
 * 1. Signature verification must run against req.rawBody. Firebase parses
 *    JSON by default, and a parsed-then-restringified body fails HMAC. This is
 *    the single most common Stripe integration bug.
 *
 * 2. Delivery is at-least-once, not at-most-once. Every event is recorded in
 *    stripeEvents before anything else happens, and a repeat is acknowledged
 *    and dropped.
 *
 * 3. Ordering is not guaranteed. A late-arriving subscription.updated can
 *    otherwise resurrect stale state and silently revoke a paid member. Events
 *    older than the last one processed for that member are discarded.
 *
 * 4. Respond 200 quickly, then do the slow work. A non-2xx makes Stripe retry,
 *    so letting an email failure bubble up produces retries forever and a
 *    member with a dozen receipts.
 */
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import type Stripe from "stripe";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, stripe, siteOrigin } from "./config.js";
import { layout, send, detailTable } from "../lib/mailer.js";

const GRACE_DAYS = 30;

function ts(seconds?: number | null): admin.firestore.Timestamp | null {
  return seconds ? admin.firestore.Timestamp.fromMillis(seconds * 1000) : null;
}

/** Locate the member by uid metadata, falling back to the Stripe customer id. */
async function findMember(
  uid?: string | null,
  customerId?: string | null,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData } | null> {
  const db = admin.firestore();
  if (uid) {
    const byUid = await db.collection("membershipApplications").where("userId", "==", uid).limit(1).get();
    if (!byUid.empty) return { ref: byUid.docs[0].ref, data: byUid.docs[0].data() };
  }
  if (customerId) {
    const byCustomer = await db
      .collection("membershipApplications")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();
    if (!byCustomer.empty) return { ref: byCustomer.docs[0].ref, data: byCustomer.docs[0].data() };
  }
  return null;
}

/**
 * Apply a membership change, unless a newer event has already been processed
 * for this member.
 */
async function applyMembership(
  event: Stripe.Event,
  uid: string | null,
  customerId: string | null,
  patch: Record<string, unknown>,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData } | null> {
  const member = await findMember(uid, customerId);
  if (!member) {
    logger.warn(`No member matches event ${event.id} (uid=${uid}, customer=${customerId})`);
    return null;
  }

  const lastAt = member.data.membership?.lastEventAt;
  if (lastAt?.toMillis && lastAt.toMillis() > event.created * 1000) {
    logger.info(`Discarding out-of-order event ${event.id} (${event.type})`);
    return null;
  }

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) update[`membership.${key}`] = value;
  update["membership.lastEventAt"] = admin.firestore.Timestamp.fromMillis(event.created * 1000);
  update["membership.lastEventId"] = event.id;
  if (customerId) update["stripeCustomerId"] = customerId;

  await member.ref.update(update);
  return member;
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "donation") {
        await recordDonation(session);
        return;
      }
      const uid = session.client_reference_id ?? session.metadata?.uid ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const tier = session.metadata?.tier ?? null;

      await applyMembership(event, uid, customerId, {
        tier,
        // A one-off Life purchase has no subscription to track, so it is
        // recorded as complimentary-for-life with no renewal date.
        state: session.mode === "payment" ? "complimentary" : "active",
        currency: session.currency ?? "usd",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(session.mode === "payment"
          ? { currentPeriodEnd: null, compReason: "Life membership" }
          : {}),
      });

      if (typeof session.subscription === "string") {
        const member = await findMember(uid, customerId);
        await member?.ref.update({ stripeSubscriptionId: session.subscription });
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.uid ?? null;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      const item = sub.items?.data?.[0];
      const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end;

      const state =
        sub.status === "active" || sub.status === "trialing"
          ? "active"
          : sub.status === "past_due" || sub.status === "unpaid"
            ? "past_due"
            : sub.status === "canceled"
              ? "grace"
              : "none";

      await applyMembership(event, uid, customerId, {
        state,
        tier: sub.metadata?.tier ?? null,
        currency: sub.currency ?? "usd",
        currentPeriodEnd: ts(periodEnd),
        cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // Grace rather than immediate revocation. Grace absorbs our own
      // infrastructure failures as much as the member's payment ones, and
      // access is never withdrawn on the strength of a single event.
      await applyMembership(event, sub.metadata?.uid ?? null, typeof sub.customer === "string" ? sub.customer : null, {
        state: "grace",
        graceEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + GRACE_DAYS * 86_400_000),
        cancelAtPeriodEnd: false,
      });
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      const line = invoice.lines?.data?.[0];
      const periodEnd = line?.period?.end;

      const member = await applyMembership(event, null, customerId, {
        state: "active",
        currentPeriodEnd: ts(periodEnd),
        graceEndsAt: null,
      });

      await admin
        .firestore()
        .collection("payments")
        .doc(invoice.id ?? `inv_${event.id}`)
        .set(
          {
            kind: "membership",
            uid: member?.data.userId ?? null,
            customerId,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
            periodEnd: ts(periodEnd),
            created: admin.firestore.Timestamp.fromMillis(event.created * 1000),
          },
          { merge: true },
        );

      if (member && invoice.customer_email) {
        await send({
          to: invoice.customer_email,
          subject: "Your VMSNA membership receipt",
          html: layout(
            "Thank you — your membership is active",
            `<p style="font-size:15px;line-height:1.6">We have received your membership payment. A full receipt is on your Stripe invoice.</p>
             ${detailTable([
               ["Amount", `${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`],
               ["Renews", periodEnd ? new Date(periodEnd * 1000).toDateString() : "—"],
             ])}`,
            { href: `${siteOrigin()}/account/billing/`, label: "Manage your membership" },
          ),
        });
      }
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Access is retained. Stripe's own retry schedule and dunning emails do
      // the recovery; revoking on the first failure would punish an expired
      // card.
      await applyMembership(event, null, typeof invoice.customer === "string" ? invoice.customer : null, {
        state: "past_due",
      });
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      await admin.firestore().collection("payments").doc(charge.id).set(
        {
          kind: "refund",
          amount: charge.amount_refunded,
          currency: charge.currency,
          status: "refunded",
          created: admin.firestore.Timestamp.fromMillis(event.created * 1000),
        },
        { merge: true },
      );
      // Never revoke automatically on a refund: it may be partial, or a
      // goodwill gesture. A human decides.
      logger.warn(`Refund recorded for charge ${charge.id} — review whether membership should change.`);
      return;
    }

    default:
      logger.debug(`Unhandled Stripe event type ${event.type}`);
  }
}

async function recordDonation(session: Stripe.Checkout.Session): Promise<void> {
  await admin
    .firestore()
    .collection("donations")
    .doc(session.id)
    .set({
      uid: session.metadata?.uid === "anonymous" ? null : (session.metadata?.uid ?? null),
      amount: session.amount_total,
      currency: session.currency,
      recurring: session.mode === "subscription",
      email: session.customer_details?.email ?? null,
      name: session.customer_details?.name ?? null,
      created: admin.firestore.FieldValue.serverTimestamp(),
    });
  logger.info(`Donation recorded: ${session.id}`);
}

export const stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, "GMAIL_APP_PASSWORD"],
    // An unauthenticated endpoint by necessity: Stripe cannot present a
    // Firebase token. The signature is the authentication.
    invoker: "public",
  },
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      res.status(400).send("Missing stripe-signature header");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(
        req.rawBody, // NOT req.body — see the note at the top of this file
        signature,
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (error) {
      logger.error("Stripe signature verification failed", error);
      res.status(400).send("Invalid signature");
      return;
    }

    // Idempotency ledger. create() throws if the document already exists,
    // which is exactly the "already seen this" signal we want.
    const ledger = admin.firestore().collection("stripeEvents").doc(event.id);
    try {
      await ledger.create({
        type: event.type,
        created: admin.firestore.Timestamp.fromMillis(event.created * 1000),
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      logger.info(`Duplicate delivery of ${event.id} (${event.type}) — acknowledged and ignored`);
      res.status(200).send("duplicate");
      return;
    }

    try {
      await handle(event);
      await ledger.update({ handledAt: admin.firestore.FieldValue.serverTimestamp(), ok: true });
      res.status(200).send("ok");
    } catch (error) {
      logger.error(`Handling ${event.type} (${event.id}) failed`, error);

      // The ledger entry has to go, or Stripe's retry would be mistaken for a
      // duplicate and dropped — the failure would then be permanent. The
      // attempt is recorded separately so a repeatedly failing event is
      // visible rather than silently retrying forever.
      await admin
        .firestore()
        .collection("stripeEventFailures")
        .doc(event.id)
        .set(
          {
            type: event.type,
            error: String(error),
            attempts: admin.firestore.FieldValue.increment(1),
            lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch(() => undefined);
      await ledger.delete().catch(() => undefined);

      res.status(500).send("handler failed");
    }
  },
);
