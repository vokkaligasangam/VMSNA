/**
 * Member-initiated account deletion.
 *
 * The old flow deleted the Firestore document from the browser and then called
 * user.delete(). If the second step failed — and it routinely did, because
 * Firebase requires a recent sign-in for it — the member's record was already
 * gone while their login survived: an account that could sign in to nothing.
 *
 * Reversing the order in the browser does not work either, since deleting the
 * Auth user destroys the credentials needed to delete the document. It has to
 * happen server-side, where both are done with one privileged identity.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

export const deleteMyAccount = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const uid = request.auth.uid;
  const db = admin.firestore();

  try {
    const apps = await db
      .collection("membershipApplications")
      .where("userId", "==", uid)
      .get();

    const batch = db.batch();
    apps.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(db.collection("directory").doc(uid));
    batch.delete(db.collection("directory").doc(`${uid}_s1`));
    batch.delete(db.collection("memberIndex").doc(uid));
    await batch.commit();

    // Auth record last: if anything above throws, the member still has a login
    // and can retry, which is the recoverable failure of the two.
    await admin.auth().deleteUser(uid);

    logger.info(`Account deleted for ${uid} (${apps.size} application records)`);
    return { deleted: true, applications: apps.size };
  } catch (error) {
    logger.error(`Account deletion failed for ${uid}`, error);
    throw new HttpsError("internal", "We could not delete the account. Please contact info@vmsna.org.");
  }
});
