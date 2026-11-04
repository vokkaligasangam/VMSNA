import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
 * Administrators permitted to call privileged callables. Mirrors isAdmin() in
 * firestore.rules; both move to custom claims in a later phase, at which point
 * this list is deleted rather than maintained in two places.
 */
export const ADMIN_EMAILS = [
  "vikramkanagaraj@gmail.com",
  "vokkaligasangam@gmail.com",
  "sureshgowder@gmail.com",
  "deeppak.kambarayar@gmail.com",
  "krishnakumarmuthian@gmail.com",
  "muru100@gmail.com",
  "vanithavijay@gmail.com",
  "raghuraja@gmail.com",
  "jegan.thiru@gmail.com",
  "skparamasivam@gmail.com",
  "drnandeesh@hotmail.com",
  "poornisaran@gmail.com",
  "sivasrees@gmail.com",
  "thirumudi@gmail.com",
];

export function requireAdmin(request: CallableRequest): void {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const email = (request.auth.token.email || "").toLowerCase();
  if (!request.auth.token.email_verified || !ADMIN_EMAILS.includes(email)) {
    logger.warn(`Rejected privileged call from ${email || "unknown"}`);
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

/**
 * Firestore caps a write batch at 500 operations. Anything that touches every
 * member — there are roughly 500 — will exceed that, so batches are committed
 * in chunks rather than accumulated into one.
 */
export class ChunkedWriter {
  private batch: FirebaseFirestore.WriteBatch;
  private queued = 0;
  private committed = 0;

  constructor(
    private readonly db: FirebaseFirestore.Firestore,
    private readonly limit = 450,
  ) {
    this.batch = db.batch();
  }

  set(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions) {
    options ? this.batch.set(ref, data, options) : this.batch.set(ref, data);
    return this.bump();
  }

  delete(ref: FirebaseFirestore.DocumentReference) {
    this.batch.delete(ref);
    return this.bump();
  }

  private async bump() {
    this.queued++;
    if (this.queued >= this.limit) await this.flush();
  }

  async flush() {
    if (this.queued === 0) return;
    await this.batch.commit();
    this.committed += this.queued;
    this.queued = 0;
    this.batch = this.db.batch();
  }

  get total() {
    return this.committed + this.queued;
  }
}
