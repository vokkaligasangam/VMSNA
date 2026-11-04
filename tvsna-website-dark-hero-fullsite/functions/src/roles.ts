/**
 * Admin identity.
 *
 * Until now "who is an admin" was a list of email addresses hardcoded in two
 * places — firestore.rules and public/admin.html — which had already drifted:
 * sivasrees@gmail.com was in the HTML and not in the rules, so that admin's
 * page loaded and then every privileged read failed.
 *
 * The source of truth is now roles/{uid} in Firestore, mirrored into custom
 * claims by syncRoleClaims. Rules read the claim, the client reads the claim,
 * and adding an admin no longer needs a deploy.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireAdmin, ADMIN_EMAILS } from "./lib/admin.js";

interface RoleDoc {
  admin?: boolean;
  superAdmin?: boolean;
  email?: string;
  grantedBy?: string;
}

/** Mirrors roles/{uid} into the user's custom claims so the two cannot drift. */
export const syncRoleClaims = onDocumentWritten(
  { document: "roles/{uid}", region: "us-central1" },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after?.data() as RoleDoc | undefined;

    const claims = {
      admin: after?.admin === true,
      superAdmin: after?.superAdmin === true,
    };

    try {
      await admin.auth().setCustomUserClaims(uid, claims.admin || claims.superAdmin ? claims : {});
      // The client watches this to know when to force a token refresh; claims
      // otherwise take up to an hour to reach an existing session.
      await admin
        .firestore()
        .collection("memberIndex")
        .doc(uid)
        .set({ claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      logger.info(`Role claims synced for ${uid}`, claims);
    } catch (error) {
      logger.error(`Could not sync role claims for ${uid}`, error);
      throw error;
    }
  },
);

function isSuperAdmin(request: Parameters<typeof requireAdmin>[0]): boolean {
  return request.auth?.token?.superAdmin === true;
}

/**
 * Grant or revoke admin access by email. superAdmin only.
 *
 * During the dual-accept window a caller on the legacy email list also counts
 * as superAdmin, otherwise nobody could make the first grant.
 */
export const setAdminRole = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);

  const legacySuper = ADMIN_EMAILS.includes((request.auth?.token.email ?? "").toLowerCase());
  if (!isSuperAdmin(request) && !legacySuper) {
    throw new HttpsError("permission-denied", "Only a super administrator can change roles.");
  }

  const email = String(request.data?.email ?? "").trim().toLowerCase();
  const grantAdmin = request.data?.admin === true;
  const grantSuper = request.data?.superAdmin === true;

  if (!email) throw new HttpsError("invalid-argument", "An email address is required.");

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", `No account exists for ${email}. They must sign in once first.`);
  }

  const db = admin.firestore();

  // Refuse to remove the last super administrator — that would lock everyone
  // out of role management with no way back except a service-account script.
  if (!grantSuper) {
    const supers = await db.collection("roles").where("superAdmin", "==", true).get();
    const remaining = supers.docs.filter((d) => d.id !== user.uid);
    if (supers.docs.some((d) => d.id === user.uid) && remaining.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "This is the last super administrator. Grant the role to someone else first.",
      );
    }
  }

  await db.collection("roles").doc(user.uid).set(
    {
      admin: grantAdmin || grantSuper,
      superAdmin: grantSuper,
      email,
      grantedBy: request.auth?.token.email ?? "unknown",
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection("adminAudit").add({
    action: grantAdmin || grantSuper ? "role.grant" : "role.revoke",
    targetUid: user.uid,
    targetEmail: email,
    admin: grantAdmin || grantSuper,
    superAdmin: grantSuper,
    by: request.auth?.token.email ?? "unknown",
    at: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Role set for ${email} by ${request.auth?.token.email}`, { grantAdmin, grantSuper });
  return { ok: true, uid: user.uid, email, admin: grantAdmin || grantSuper, superAdmin: grantSuper };
});

/** Everyone currently holding a role, for the admin console. */
export const listAdminRoles = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);
  const snap = await admin.firestore().collection("roles").get();
  return {
    roles: snap.docs.map((d) => ({
      uid: d.id,
      email: d.data().email ?? null,
      admin: d.data().admin === true,
      superAdmin: d.data().superAdmin === true,
      grantedBy: d.data().grantedBy ?? null,
    })),
    // Surfaced so the console can show who is still only on the legacy list.
    legacyEmails: ADMIN_EMAILS,
  };
});

/**
 * What the caller's own token actually says. This is what each admin uses to
 * confirm their claim has landed before the legacy email branch is removed
 * from the rules.
 */
export const whoAmI = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const email = (request.auth.token.email ?? "").toLowerCase();
  const roleDoc = await admin.firestore().collection("roles").doc(request.auth.uid).get();
  return {
    uid: request.auth.uid,
    email,
    emailVerified: request.auth.token.email_verified === true,
    claims: {
      admin: request.auth.token.admin === true,
      superAdmin: request.auth.token.superAdmin === true,
    },
    roleDocument: roleDoc.exists ? roleDoc.data() : null,
    onLegacyList: ADMIN_EMAILS.includes(email),
    // True once the claim is present, i.e. this admin no longer depends on the
    // legacy email branch in firestore.rules.
    readyForClaimsOnly: request.auth.token.admin === true,
  };
});
