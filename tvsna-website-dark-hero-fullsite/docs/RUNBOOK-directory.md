# Runbook — member directory cutover

The directory moved from "the browser downloads every approved application and
hides some of it with CSS" to "a Cloud Function publishes a projection
containing only what each member's privacy level permits".

Until the projection is populated and the new client is live, the old
permissive read has to stay in `firestore.rules`, or the directory empties for
every member. **This runbook is how that read gets removed.** It is a
same-week follow-up, not a someday item — it is the last piece of the data leak.

## Why the transitional read exists

`firestore.rules` currently contains, on `membershipApplications`:

```
allow read: if (signedIn() && isOwner(resource.data.userId))
            || isAdmin()
            || (signedIn() && resource.data.status == 'approved');   // <- remove this
```

The third disjunct is what lets any signed-in member read every field of every
approved application, including the phone, address and children's details of
members who chose a limited profile. The new client does not use it. The old
client, still live until the new member area is deployed, does.

## Order of operations

The steps are ordered so the directory is never empty. Do not reorder them.

**1. Deploy the functions.**

```bash
cd tvsna-website-dark-hero-fullsite/functions
npm run build
firebase deploy --only functions:projectMemberToDirectory,functions:rebuildDirectory,functions:deleteMyAccount
```

**2. Deploy the rules.** These add `directory` and `memberIndex` and change
nothing about the existing read, so the live site is unaffected.

```bash
firebase deploy --only firestore:rules
```

**3. Populate the projection — dry run first.** `rebuildDirectory` is an
admin-only callable. Call it with `{ dryRun: true }` and read the report before
writing anything.

```js
// From the browser console, signed in as an admin:
const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'rebuildDirectory');
(await fn({ dryRun: true })).data;
```

Check the report before continuing:

| Field | What to check |
| --- | --- |
| `applicationsScanned` | Matches the collection size you expect (~500) |
| `approved` | The number of members who should appear in the directory |
| `missingUserId` | Records with no `userId`. These cannot be projected — investigate before proceeding |
| `duplicateUids` | Members with more than one application. Only the first is projected |
| `spouseRows` | Extra rows for spouses without their own login |
| `removedStale` | Should be 0 on the first run |

**4. Write it.**

```js
(await fn({ dryRun: false })).data;
```

Then spot-check in the Firebase console: pick a member whose `privacyLevel` is
`limited` and confirm their `directory/{uid}` document contains **only**
`name`, `state`, `privacyLevel`, `uid`, `search` and `updatedAt`. If it contains
a phone number or an address, stop and fix the projection before going further.

**5. Deploy the new site.**

```bash
cd tvsna-website-dark-hero-fullsite
npm --prefix web run build
firebase deploy --only hosting
```

**6. Verify as a real member.** Sign in as an approved member, open
`/directory/`, and confirm in devtools → Network that the response for the
`directory` collection contains no field beyond what the member chose to share.
This is the acceptance test for the whole piece of work.

**7. Remove the transitional read.** Delete the third disjunct from the
`membershipApplications` read rule in `firestore.rules`, leaving:

```
allow read: if (signedIn() && isOwner(resource.data.userId)) || isAdmin();
```

Run the rules tests, then deploy:

```bash
npm --prefix tests/rules test
firebase deploy --only firestore:rules
```

**8. Confirm the hole is closed.** Signed in as an ordinary member, in the
console:

```js
// Should now be rejected with a permissions error.
await getDocs(query(collection(db, 'membershipApplications'), where('status','==','approved')));
```

A `permission-denied` here is the success condition.

## Rolling back

Steps 1–5 are additive and safe to leave in place. If step 7 causes a problem,
restore the third disjunct and redeploy the rules; the old client still works
because nothing was deleted from `membershipApplications`.

## Ongoing

`projectMemberToDirectory` keeps the projection in step automatically on every
application write, including approvals, rejections and privacy changes. If the
projection is ever suspected of being stale — a failed deploy, a trigger
outage — `rebuildDirectory` is a full reconcile and is safe to re-run at any
time; it also removes directory rows whose application no longer exists.
