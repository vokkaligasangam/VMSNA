# Runbook — moving admin identity to custom claims

Admin access used to be a list of email addresses hardcoded in two places:
`firestore.rules` (13 addresses) and `public/admin.html` (14). They had already
drifted — `sivasrees@gmail.com` was in the HTML and not in the rules, so that
admin's page loaded and then every privileged read failed.

The source of truth is now `roles/{uid}` in Firestore, mirrored into a custom
claim by `syncRoleClaims`. Rules read the claim, the console reads the claim,
and adding an admin no longer needs a deploy.

**Both mechanisms are accepted during the migration.** The email branch in the
rules is removed in a separate, later deploy, once every administrator has
confirmed their claim has landed. Compressing these into one step risks locking
every admin out at once.

## 1. Deploy

```bash
cd tvsna-website-dark-hero-fullsite/functions
npm run build
firebase deploy --only functions:syncRoleClaims,functions:setAdminRole,functions:listAdminRoles,functions:whoAmI
firebase deploy --only firestore:rules      # adds roles + adminAudit, keeps dual-accept
cd .. && npm --prefix web run build && firebase deploy --only hosting
```

## 2. Seed the roles

Run once, from a machine with a service-account key. This is deliberately
independent of the website, the rules and anyone's existing claim — it is also
the break-glass route back in if every admin is ever locked out.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node scripts/admin/bootstrap-roles.mjs --dry-run
```

The dry run prints a table of resolved administrators and lists anyone with no
Auth account — they have never signed in, so there is nothing to attach a claim
to, and they must sign in once before they can be granted a role.

Choose the super administrators deliberately. They are the only people who can
grant and revoke roles from the console. Two is a sensible number: one is a
single point of failure, and the script refuses to remove the last one.

```bash
node scripts/admin/bootstrap-roles.mjs --super raghuraja@gmail.com,vokkaligasangam@gmail.com
```

## 3. Have each administrator confirm

Every admin signs out, signs back in, and opens **/admin/roles/**. That page
shows them their own decoded token and states plainly whether their claim has
arrived.

The page also shows the whole roster and counts how many people are still on
the legacy email list only. **That count reaching zero is the gate for step 4.**

A claim reaches an existing session only when the ID token refreshes — up to an
hour. Signing out and back in is immediate.

## 4. Remove the legacy email branch

Only once /admin/roles/ reports that every administrator has a claim.

In `firestore.rules`, replace:

```
function isAdmin() {
  return signedIn() && (request.auth.token.admin == true || onLegacyAdminList());
}
```

with:

```
function isAdmin() {
  return signedIn() && request.auth.token.admin == true;
}
```

and delete the `onLegacyAdminList()` function and its address list. Then:

```bash
npm --prefix tests/rules test
firebase deploy --only firestore:rules
```

Also delete `ADMIN_EMAILS` from `functions/src/lib/admin.ts`, change
`requireAdmin` to check `request.auth.token.admin`, and remove the
`ADMIN_EMAILS` fallback from `web/src/lib/authStore.ts`. At that point the list
exists nowhere.

## 5. Afterwards

Roles are managed from **/admin/roles/** by a super administrator. Grants and
revocations are written to `adminAudit` with who did it and when.

## If everyone is locked out

Re-run `bootstrap-roles.mjs`. It needs only the service-account key, sets the
claim directly as well as writing the role document, and does not depend on the
site, the rules, or any existing claim being correct.
