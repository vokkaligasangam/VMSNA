#!/usr/bin/env node
/**
 * One-time seeding of admin roles, and the break-glass route back in.
 *
 * Writes roles/{uid} for each address on the legacy list. The syncRoleClaims
 * trigger then mirrors those documents into custom claims.
 *
 * This script depends only on a service-account key — not on the website, the
 * rules, or anybody's claim already being correct. If every administrator is
 * ever locked out, this is how access is restored.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/admin/bootstrap-roles.mjs --dry-run
 *   node scripts/admin/bootstrap-roles.mjs --super you@example.com,other@example.com
 *
 * The key file must never be committed; *firebase-adminsdk*.json is gitignored.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ADMIN_EMAILS = [
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
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const superArg = args[args.indexOf('--super') + 1];
const supers = new Set(
  (args.includes('--super') && superArg ? superArg.split(',') : ['raghuraja@gmail.com'])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account key.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

console.log(dryRun ? 'DRY RUN — nothing will be written\n' : 'Writing roles\n');
console.log(`Super administrators: ${[...supers].join(', ')}\n`);

const resolved = [];
const unresolved = [];

for (const email of ADMIN_EMAILS) {
  try {
    const user = await auth.getUserByEmail(email);
    resolved.push({ email, uid: user.uid, superAdmin: supers.has(email) });
  } catch {
    // Expected for anyone who has never signed in. They cannot be granted a
    // claim until an Auth account exists.
    unresolved.push(email);
  }
}

console.table(
  resolved.map((r) => ({ email: r.email, uid: r.uid.slice(0, 10) + '…', super: r.superAdmin })),
);

if (unresolved.length) {
  console.log('\nNo Auth account yet (they must sign in once first):');
  unresolved.forEach((e) => console.log('  ' + e));
}

if (supers.size > 0 && !resolved.some((r) => r.superAdmin)) {
  console.error(
    '\nRefusing to continue: none of the requested super administrators has an account.',
  );
  console.error('Without one, nobody can grant roles from the admin console.');
  process.exit(1);
}

if (dryRun) {
  console.log(`\nWould write ${resolved.length} role documents. Re-run without --dry-run.`);
  process.exit(0);
}

for (const r of resolved) {
  await db.collection('roles').doc(r.uid).set(
    {
      admin: true,
      superAdmin: r.superAdmin,
      email: r.email,
      grantedBy: 'bootstrap-roles.mjs',
      grantedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  // Set the claim directly too, so this works even if syncRoleClaims is not
  // deployed yet — which is the case the break-glass path has to survive.
  await auth.setCustomUserClaims(r.uid, { admin: true, superAdmin: r.superAdmin });
  console.log(`  granted ${r.email}${r.superAdmin ? ' (super)' : ''}`);
}

console.log(`\nDone. ${resolved.length} administrators seeded.`);
console.log('Each must sign out and back in for the claim to reach their session.');
console.log('Confirm with /admin/roles, which shows each admin their own decoded token.');
process.exit(0);
