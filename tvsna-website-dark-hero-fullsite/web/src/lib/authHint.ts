/*
  A tiny, non-authoritative cache of "what should this page look like".

  onAuthStateChanged resolves asynchronously after IndexedDB I/O — typically
  150–400ms — which is long enough for a returning member to see the signed-out
  layout before their own. The hint lets the first paint be right.

  It holds booleans, an enum and an expiry. No name, no email, no token.
  If it is stale, forged or absent the page corrects itself within a tick and
  Firestore refuses the reads regardless: this is a rendering hint, not a
  credential, and nothing is authorised on the strength of it.
*/

export const HINT_KEY = 'vmsna.authHint';
export const HINT_VERSION = 1;
const TTL_MS = 12 * 60 * 60 * 1000;

export type GateState = 'unknown' | 'guest' | 'pending' | 'rejected' | 'member';

export interface AuthHint {
  v: number;
  signedIn: boolean;
  state: GateState;
  admin: boolean;
  exp: number;
}

export function readHint(): AuthHint | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw) as AuthHint;
    if (hint.v !== HINT_VERSION || hint.exp < Date.now()) return null;
    return hint;
  } catch {
    return null;
  }
}

export function writeHint(state: GateState, admin = false): void {
  try {
    localStorage.setItem(
      HINT_KEY,
      JSON.stringify({
        v: HINT_VERSION,
        signedIn: state !== 'guest' && state !== 'unknown',
        state,
        admin,
        exp: Date.now() + TTL_MS,
      } satisfies AuthHint),
    );
  } catch {
    /* private browsing, blocked storage — the page still works, just without the hint */
  }
}

export function clearHint(): void {
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    /* ignore */
  }
}

/** Single place that decides what the document is showing. */
export function applyGate(state: GateState, admin = false): void {
  const el = document.documentElement;
  el.dataset.auth = state;
  if (admin) el.dataset.role = 'admin';
  else delete el.dataset.role;
}
