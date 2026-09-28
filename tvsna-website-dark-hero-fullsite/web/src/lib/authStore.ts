/*
  Authoritative auth state for the member area.

  The hint in authHint.ts decides the first paint; this decides the truth. It
  resolves the signed-in user, their verification state and their membership
  status, then rewrites both the gate attribute and the hint.

  Membership status comes from the member's own application document, which
  they are allowed to read. It moves to a custom claim when roles land, at
  which point gating costs no reads at all.
*/
import type { User } from 'firebase/auth';
import { applyGate, writeHint, clearHint, type GateState } from './authHint';

export interface MemberRecord {
  docId: string;
  data: Record<string, any>;
}

export interface AuthState {
  ready: boolean;
  user: User | null;
  verified: boolean;
  state: GateState;
  member: MemberRecord | null;
  isAdmin: boolean;
}

/*
  DUAL-ACCEPT WINDOW — delete this list when firestore.rules drops its own.
  Admin identity is a custom claim now; the email list is kept only so that an
  administrator whose claim has not yet been granted still sees the admin link.
  Nothing is authorised here either way: /admin/* re-checks the claim against a
  forced token refresh, and the rules are the real boundary.
  See docs/RUNBOOK-admin-roles.md
*/
const LEGACY_ADMIN_EMAILS = new Set([
  'vikramkanagaraj@gmail.com',
  'vokkaligasangam@gmail.com',
  'sureshgowder@gmail.com',
  'deeppak.kambarayar@gmail.com',
  'krishnakumarmuthian@gmail.com',
  'muru100@gmail.com',
  'vanithavijay@gmail.com',
  'raghuraja@gmail.com',
  'jegan.thiru@gmail.com',
  'skparamasivam@gmail.com',
  'drnandeesh@hotmail.com',
  'poornisaran@gmail.com',
  'sivasrees@gmail.com',
  'thirumudi@gmail.com',
]);

let state: AuthState = {
  ready: false,
  user: null,
  verified: false,
  state: 'unknown',
  member: null,
  isAdmin: false,
};

const listeners = new Set<(s: AuthState) => void>();
let started = false;

export function getAuthState(): AuthState {
  return state;
}

export function onAuth(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  if (state.ready) fn(state);
  return () => listeners.delete(fn);
}

function publish(next: Partial<AuthState>) {
  state = { ...state, ...next };
  applyGate(state.state, state.isAdmin);
  if (state.state === 'guest') clearHint();
  else if (state.state !== 'unknown') writeHint(state.state, state.isAdmin);
  listeners.forEach((fn) => fn(state));
}

/** Resolve the caller's own application record. One read, own document only. */
async function loadOwnRecord(uid: string): Promise<MemberRecord | null> {
  const [{ db }, { collection, query, where, limit, getDocs }] = await Promise.all([
    import('./firebase'),
    import('firebase/firestore'),
  ]);
  const snap = await getDocs(
    query(collection(db(), 'membershipApplications'), where('userId', '==', uid), limit(1)),
  );
  if (snap.empty) return null;
  return { docId: snap.docs[0].id, data: snap.docs[0].data() };
}

export async function startAuth(): Promise<void> {
  if (started) return;
  started = true;

  let auth: typeof import('./firebase')['auth'];
  let onAuthStateChanged: typeof import('firebase/auth')['onAuthStateChanged'];

  try {
    [{ auth }, { onAuthStateChanged }] = await Promise.all([
      import('./firebase'),
      import('firebase/auth'),
    ]);
  } catch (error) {
    /*
      A failed dynamic import — a stale chunk after a deploy, a blocked
      request — would otherwise leave gated pages stuck on data-auth="unknown"
      showing a skeleton forever. Fall back to the signed-out view, which is
      always safe: it reveals nothing and offers a way back in.
    */
    console.error('Auth failed to initialise; falling back to the signed-out view', error);
    publish({ ready: true, user: null, verified: false, state: 'guest', member: null, isAdmin: false });
    return;
  }

  onAuthStateChanged(auth(), async (user) => {
    if (!user) {
      publish({ ready: true, user: null, verified: false, state: 'guest', member: null, isAdmin: false });
      return;
    }

    // Prefer the claim; fall back to the legacy list only while it still exists.
    let isAdmin = LEGACY_ADMIN_EMAILS.has((user.email ?? '').toLowerCase());
    try {
      const token = await user.getIdTokenResult();
      if (token.claims.admin === true) isAdmin = true;
    } catch {
      /* token unavailable — the fallback above still applies */
    }

    if (!user.emailVerified) {
      // Unverified accounts are treated as pending: the member area shows the
      // verify-your-email panel rather than the directory.
      publish({ ready: true, user, verified: false, state: 'pending', member: null, isAdmin });
      return;
    }

    let member: MemberRecord | null = null;
    try {
      member = await loadOwnRecord(user.uid);
    } catch (error) {
      console.error('Could not load membership record', error);
    }

    const status = member?.data?.status;
    const gate: GateState =
      status === 'approved' ? 'member' : status === 'rejected' ? 'rejected' : 'pending';

    publish({ ready: true, user, verified: true, state: gate, member, isAdmin });
  });
}

export async function signOutNow(): Promise<void> {
  const [{ auth }, { signOut }] = await Promise.all([
    import('./firebase'),
    import('firebase/auth'),
  ]);
  clearHint();
  await signOut(auth());
}
