/*
  Client mirror of functions/src/lib/access.ts.

  Kept deliberately small and identical in shape. This decides what the UI
  offers; it decides nothing about what data exists. Firestore rules and the
  server-written directory projection are the actual boundary, so a mismatch
  here is a cosmetic bug rather than a security one.
*/

export type MembershipState =
  | 'none'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'complimentary'
  | 'canceled'
  | 'expired';

export const ACCESS_STATES: MembershipState[] = ['active', 'grace', 'complimentary'];

/**
 * Must match ENFORCE_MEMBERSHIP_PAYMENT on the functions side. Off until every
 * existing member has been grandfathered — see docs/RUNBOOK-stripe.md.
 */
export const PAYMENT_ENFORCED = import.meta.env.PUBLIC_ENFORCE_MEMBERSHIP_PAYMENT === 'true';

export interface MembershipRecord {
  status?: string;
  membership?: { state?: string; currentPeriodEnd?: any; cancelAtPeriodEnd?: boolean; tier?: string } | null;
}

export function hasMemberAccess(record: MembershipRecord): boolean {
  if (record.status !== 'approved') return false;
  if (!PAYMENT_ENFORCED) return true;
  const state = record.membership?.state as MembershipState | undefined;
  return state !== undefined && ACCESS_STATES.includes(state);
}

/** Does this member still need to pay? Drives the activate prompt. */
export function needsActivation(record: MembershipRecord): boolean {
  if (record.status !== 'approved') return false;
  const state = record.membership?.state;
  return !state || state === 'none' || state === 'expired' || state === 'canceled';
}

const LABELS: Record<string, string> = {
  active: 'Active',
  complimentary: 'Complimentary',
  grace: 'Ended — access continues for a short period',
  past_due: 'Payment failed — retrying',
  expired: 'Lapsed',
  canceled: 'Cancelled',
  none: 'Not yet set up',
};

export function membershipLabel(record: MembershipRecord): string {
  return LABELS[record.membership?.state ?? 'none'] ?? 'Unknown';
}

export function formatRenewal(record: MembershipRecord): string | null {
  const end = record.membership?.currentPeriodEnd;
  const date = end?.toDate?.() ?? (end ? new Date(end) : null);
  if (!date || Number.isNaN(date.getTime())) return null;
  const verb = record.membership?.cancelAtPeriodEnd ? 'Access ends' : 'Renews';
  return `${verb} ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
