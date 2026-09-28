/*
  Thin wrappers over the admin callables, so pages do not each re-import the
  Firebase modules and hand-roll error handling.
*/

async function call<T>(name: string, payload: unknown = {}): Promise<T> {
  const [{ functions }, { httpsCallable }] = await Promise.all([
    import('./firebase'),
    import('firebase/functions'),
  ]);
  const result = await httpsCallable(functions(), name)(payload);
  return result.data as T;
}

export interface VerificationInfo {
  emailVerified: boolean;
  email: string | null;
  lastSignIn: string | null;
}

export const getVerificationStatuses = (uids: string[]) =>
  call<{ users: Record<string, VerificationInfo> }>('getVerificationStatuses', { uids });

export const diagnoseMember = (email: string) =>
  call<Record<string, any>>('diagnoseMember', { email });

export const requeueAdminNotification = (docId: string) =>
  call<{ ok: boolean; message: string }>('requeueAdminNotification', { docId });

export const listAdminRoles = () =>
  call<{
    roles: { uid: string; email: string | null; admin: boolean; superAdmin: boolean; grantedBy: string | null }[];
    legacyEmails: string[];
  }>('listAdminRoles');

export const setAdminRole = (email: string, opts: { admin: boolean; superAdmin: boolean }) =>
  call<{ ok: boolean }>('setAdminRole', { email, ...opts });

export const whoAmI = () => call<Record<string, any>>('whoAmI');

export const rebuildDirectory = (dryRun: boolean) =>
  call<Record<string, number | boolean>>('rebuildDirectory', { dryRun });

/** Turns a callable error into something a volunteer can act on. */
export function readableError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'functions/permission-denied') return 'You do not have permission to do that.';
  if (e?.code === 'functions/unauthenticated') return 'Your session expired. Please sign in again.';
  if (e?.code === 'functions/not-found') return e.message ?? 'Not found.';
  if (e?.code === 'functions/failed-precondition') return e.message ?? 'That is not allowed right now.';
  return e?.message ?? 'Something went wrong. Please try again.';
}
