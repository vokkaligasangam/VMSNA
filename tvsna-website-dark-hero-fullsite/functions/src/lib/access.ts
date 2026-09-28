/**
 * The single definition of "may this person use the member directory".
 *
 * Two orthogonal axes, deliberately never conflated:
 *
 *   status            eligibility — is this a Tamil Nadu Vokkaliga family?
 *                     Decided by a human on the committee. Values are
 *                     unchanged from before Stripe existed, which is why the
 *                     admin queue, the notification paths, the adminNotified
 *                     flag and both composite indexes all keep working.
 *
 *   membership.state  payment standing. Written only by the Stripe webhook
 *                     and the daily reconciler.
 *
 * The same expression is mirrored in web/src/lib/access.ts and in
 * firestore.rules. A shared fixture keeps the three honest.
 */

export type MembershipState =
  | "none"
  | "active"
  | "past_due"
  | "grace"
  | "complimentary"
  | "canceled"
  | "expired";

/** States that still open the directory. */
export const ACCESS_STATES: MembershipState[] = ["active", "grace", "complimentary"];

/**
 * Payment enforcement is off until every existing member has been
 * grandfathered. Turning it on before then would revoke the directory for
 * roughly 500 people at once.
 *
 * Flip with:  firebase functions:config or the ENFORCE_MEMBERSHIP_PAYMENT
 * environment variable, per docs/RUNBOOK-stripe.md step 8.
 */
export function paymentEnforced(): boolean {
  return process.env.ENFORCE_MEMBERSHIP_PAYMENT === "true";
}

export interface AccessInput {
  status?: string;
  membership?: { state?: string } | null;
}

export function hasMemberAccess(record: AccessInput): boolean {
  if (record.status !== "approved") return false;
  if (!paymentEnforced()) return true;
  const state = record.membership?.state as MembershipState | undefined;
  return state !== undefined && ACCESS_STATES.includes(state);
}

/** Why access was granted or refused — surfaced in admin diagnostics. */
export function explainAccess(record: AccessInput): string {
  if (record.status !== "approved") {
    return `Application status is "${record.status ?? "unset"}", not "approved".`;
  }
  if (!paymentEnforced()) {
    return "Approved. Payment enforcement is currently off, so all approved members have access.";
  }
  const state = record.membership?.state ?? "none";
  return ACCESS_STATES.includes(state as MembershipState)
    ? `Approved and membership is "${state}".`
    : `Approved, but membership state is "${state}" — access is withheld.`;
}
