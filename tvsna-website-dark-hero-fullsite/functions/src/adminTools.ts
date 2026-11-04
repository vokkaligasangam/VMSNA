/**
 * Tools for the admin console.
 *
 * getVerificationStatuses replaces the old pattern where admin.html called
 * getUserVerificationStatus once per pending row, sequentially, awaiting each
 * — the dominant cost of loading that page.
 *
 * diagnoseMember generalises the four one-off debug pages that used to be
 * served publicly with a member's name and email address baked into them.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireAdmin } from "./lib/admin.js";

export const getVerificationStatuses = onCall(
  { region: "us-central1" },
  async (request) => {
    requireAdmin(request);

    const uids: string[] = Array.isArray(request.data?.uids) ? request.data.uids : [];
    if (uids.length === 0) return { users: {} };
    if (uids.length > 100) {
      throw new HttpsError("invalid-argument", "At most 100 users per call.");
    }

    const result = await admin.auth().getUsers(uids.map((uid) => ({ uid })));
    const users: Record<string, { emailVerified: boolean; email: string | null; lastSignIn: string | null }> = {};

    for (const user of result.users) {
      users[user.uid] = {
        emailVerified: user.emailVerified,
        email: user.email ?? null,
        lastSignIn: user.metadata.lastSignInTime ?? null,
      };
    }
    for (const missing of result.notFound) {
      // An application whose Auth user no longer exists — worth surfacing
      // rather than silently rendering as "not verified".
      const uid = (missing as { uid?: string }).uid;
      if (uid) users[uid] = { emailVerified: false, email: null, lastSignIn: null };
    }

    return { users, found: result.users.length, missing: result.notFound.length };
  },
);

/**
 * Everything known about one member, by email. This is the page that makes the
 * hasini-style incident tools unnecessary: same diagnosis, no hardcoded
 * addresses, admin-only, and not reachable by the public.
 */
export const diagnoseMember = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);

  const email = String(request.data?.email ?? "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "An email address is required.");

  const db = admin.firestore();
  const out: Record<string, unknown> = { email };

  let uid: string | null = null;
  try {
    const user = await admin.auth().getUserByEmail(email);
    uid = user.uid;
    out.auth = {
      uid: user.uid,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      created: user.metadata.creationTime,
      lastSignIn: user.metadata.lastSignInTime ?? null,
      claims: user.customClaims ?? {},
    };
  } catch {
    out.auth = null;
  }

  const apps = await db.collection("membershipApplications").where("email", "==", email).get();
  out.applications = apps.docs.map((d) => {
    const data = d.data();
    return {
      docId: d.id,
      userId: data.userId ?? null,
      status: data.status ?? null,
      // The field being absent rather than false is what made the original
      // incident invisible: the scheduler queries adminNotified == false.
      adminNotified: Object.prototype.hasOwnProperty.call(data, "adminNotified")
        ? data.adminNotified
        : "FIELD MISSING",
      privacyLevel: data.privacyLevel ?? null,
      submittedAt: data.submittedAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  if (uid) {
    const [dir, idx, role] = await Promise.all([
      db.collection("directory").doc(uid).get(),
      db.collection("memberIndex").doc(uid).get(),
      db.collection("roles").doc(uid).get(),
    ]);
    out.directoryEntry = dir.exists ? dir.data() : null;
    out.memberIndex = idx.exists ? idx.data() : null;
    out.role = role.exists ? role.data() : null;
  }

  // Plain-language reading of the above, so the diagnosis does not depend on
  // the reader knowing the data model.
  const findings: string[] = [];
  const app = (out.applications as any[])[0];
  if (!out.auth) findings.push("No Firebase Auth account exists for this address.");
  else if (!(out.auth as any).emailVerified) findings.push("Email is not verified, so the committee has not been notified.");
  if (apps.empty) findings.push("No membership application found for this address.");
  if (apps.size > 1) findings.push(`${apps.size} applications exist for this address — duplicates.`);
  if (app?.adminNotified === "FIELD MISSING")
    findings.push("adminNotified is absent, so the 5-minute scheduler will never see this record. Set it to false to queue a notification.");
  if (app?.status === "approved" && !out.directoryEntry)
    findings.push("Approved but missing from the directory — run rebuildDirectory.");
  if (app?.status === "approved" && !(out.memberIndex as any)?.access)
    findings.push("Approved but memberIndex.access is not true, so the directory will refuse to load for them.");
  if (findings.length === 0) findings.push("Nothing anomalous found.");
  out.findings = findings;

  logger.info(`diagnoseMember ${email} by ${request.auth?.token.email}`);
  return out;
});

/** Requeue an admin notification for one application. Replaces fix-hasini.html. */
export const requeueAdminNotification = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);
  const docId = String(request.data?.docId ?? "");
  if (!docId) throw new HttpsError("invalid-argument", "A document id is required.");

  const db = admin.firestore();
  const ref = db.collection("membershipApplications").doc(docId);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpsError("not-found", "No such application.");

  await ref.update({ adminNotified: false });
  await db.collection("adminAudit").add({
    action: "notification.requeue",
    docId,
    by: request.auth?.token.email ?? "unknown",
    at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, message: "Queued. The scheduled check runs every five minutes." };
});
