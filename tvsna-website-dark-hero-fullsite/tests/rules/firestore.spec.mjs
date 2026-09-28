// Firestore security rules tests.
//
// These exist because every one of the holes they check was previously written,
// commented and shipped wrong — the old rules carried the comment "only admins
// can read" directly above a rule granting read access to every signed-in user.
//
// Run with:  npm --prefix tests/rules install
//            firebase emulators:exec --only firestore "node --test tests/rules"
// Requires Java 11+ (the Firestore emulator is a Java process).

import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query,
  setDoc, updateDoc, where,
} from 'firebase/firestore';

const PROJECT_ID = 'vmsna-rules-test';
const ADMIN = 'raghuraja@gmail.com';

let testEnv;

const asMember = (uid, email) =>
  testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

function application(uid, overrides = {}) {
  return {
    userId: uid,
    name: 'Test Member',
    email: `${uid}@example.com`,
    status: 'pending',
    adminNotified: false,
    privacyLevel: 'full',
    ...overrides,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => { await testEnv?.cleanup(); });

describe('membershipApplications', () => {
  it('lets an applicant create their own pending application', async () => {
    const db = asMember('alice', 'alice@example.com');
    await assertSucceeds(setDoc(doc(db, 'membershipApplications/alice'), application('alice')));
  });

  it('refuses an application that is approved at birth', async () => {
    const db = asMember('mallory', 'mallory@example.com');
    await assertFails(setDoc(
      doc(db, 'membershipApplications/mallory'),
      application('mallory', { status: 'approved' }),
    ));
  });

  it('refuses an application created on someone else behalf', async () => {
    const db = asMember('mallory', 'mallory@example.com');
    await assertFails(setDoc(doc(db, 'membershipApplications/x'), application('alice')));
  });

  // The hole that mattered most: nothing stopped a pending member writing
  // status = 'approved' and granting themselves the member directory.
  it('refuses a member promoting themselves to approved', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'membershipApplications/bob'), application('bob'));
    });
    const db = asMember('bob', 'bob@example.com');
    await assertFails(updateDoc(doc(db, 'membershipApplications/bob'), { status: 'approved' }));
  });

  it('refuses a member editing the review fields', async () => {
    const db = asMember('bob', 'bob@example.com');
    await assertFails(updateDoc(doc(db, 'membershipApplications/bob'), { adminNotified: true }));
    await assertFails(updateDoc(doc(db, 'membershipApplications/bob'), { approvedBy: ADMIN }));
  });

  it('lets a member edit their own profile fields', async () => {
    const db = asMember('bob', 'bob@example.com');
    await assertSucceeds(updateDoc(doc(db, 'membershipApplications/bob'), {
      phone: '+1 555 0100', profession: 'Teacher', privacyLevel: 'limited',
    }));
  });

  it('lets an admin change status but not profile fields', async () => {
    const db = asMember('admin1', ADMIN);
    await assertSucceeds(updateDoc(doc(db, 'membershipApplications/bob'), { status: 'approved' }));
    await assertFails(updateDoc(doc(db, 'membershipApplications/bob'), { name: 'Renamed' }));
  });

  it('refuses reading another member pending application', async () => {
    const db = asMember('alice', 'alice@example.com');
    await assertFails(getDoc(doc(db, 'membershipApplications/carol')));
  });

  it('refuses an unauthenticated read', async () => {
    await assertFails(getDoc(doc(asAnon(), 'membershipApplications/bob')));
  });

  // Guards the live member directory: if this query stops being provable,
  // every non-admin sees an empty directory.
  it('allows the approved-only directory query for a signed-in member', async () => {
    const db = asMember('alice', 'alice@example.com');
    await assertSucceeds(getDocs(query(
      collection(db, 'membershipApplications'), where('status', '==', 'approved'),
    )));
  });

  it('refuses an unfiltered listing of all applications', async () => {
    const db = asMember('alice', 'alice@example.com');
    await assertFails(getDocs(collection(db, 'membershipApplications')));
  });
});

describe('helpRequests — welfare data', () => {
  const valid = {
    name: 'Anon Applicant',
    email: 'help@example.com',
    requestType: 'Medical',
    status: 'pending',
    summary: 'Assistance request',
  };

  it('accepts a well-formed anonymous submission', async () => {
    await assertSucceeds(setDoc(doc(asAnon(), 'helpRequests/r1'), valid));
  });

  it('refuses a submission with an unknown request type', async () => {
    await assertFails(setDoc(doc(asAnon(), 'helpRequests/r2'), { ...valid, requestType: 'Spam' }));
  });

  it('refuses a submission that is not pending', async () => {
    await assertFails(setDoc(doc(asAnon(), 'helpRequests/r3'), { ...valid, status: 'approved' }));
  });

  // Previously readable by every signed-in member. These are medical and
  // employment hardship disclosures.
  it('refuses a member reading welfare requests', async () => {
    const db = asMember('bob', 'bob@example.com');
    await assertFails(getDoc(doc(db, 'helpRequests/r1')));
    await assertFails(getDocs(collection(db, 'helpRequests')));
  });

  it('lets an admin read them', async () => {
    await assertSucceeds(getDoc(doc(asMember('admin1', ADMIN), 'helpRequests/r1')));
  });

  it('refuses deletion by anyone, including an admin', async () => {
    await assertFails(deleteDoc(doc(asMember('bob', 'bob@example.com'), 'helpRequests/r1')));
    await assertFails(deleteDoc(doc(asMember('admin1', ADMIN), 'helpRequests/r1')));
  });
});

describe('contactMessages', () => {
  const valid = {
    name: 'Visitor', email: 'v@example.com',
    subject: 'Hello', message: 'Question', status: 'unread',
  };

  it('accepts an anonymous message', async () => {
    await assertSucceeds(setDoc(doc(asAnon(), 'contactMessages/m1'), valid));
  });

  it('refuses a member reading messages', async () => {
    await assertFails(getDoc(doc(asMember('bob', 'bob@example.com'), 'contactMessages/m1')));
  });

  it('lets an admin read them', async () => {
    await assertSucceeds(getDoc(doc(asMember('admin1', ADMIN), 'contactMessages/m1')));
  });
});

describe('directory — the privacy-filtered projection', () => {
  before(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Written only by Cloud Functions in production.
      await setDoc(doc(db, 'directory/bob'), { uid: 'bob', name: 'Bob', state: 'TX', privacyLevel: 'full' });
      await setDoc(doc(db, 'directory/lakshmi'), { uid: 'lakshmi', name: 'Lakshmi', state: 'CA', privacyLevel: 'limited' });
      await setDoc(doc(db, 'memberIndex/bob'), { status: 'approved', access: true });
      await setDoc(doc(db, 'memberIndex/dana'), { status: 'pending', access: false });
    });
  });

  it('lets an approved member read and list the directory', async () => {
    const db = asMember('bob', 'bob@example.com');
    await assertSucceeds(getDoc(doc(db, 'directory/lakshmi')));
    await assertSucceeds(getDocs(collection(db, 'directory')));
  });

  it('refuses a member whose access flag is false', async () => {
    const db = asMember('dana', 'dana@example.com');
    await assertFails(getDocs(collection(db, 'directory')));
  });

  it('refuses a member with no index entry at all', async () => {
    const db = asMember('stranger', 'stranger@example.com');
    await assertFails(getDocs(collection(db, 'directory')));
  });

  it('refuses an unauthenticated read', async () => {
    await assertFails(getDocs(collection(asAnon(), 'directory')));
  });

  it('lets an admin read it', async () => {
    await assertSucceeds(getDocs(collection(asMember('admin1', ADMIN), 'directory')));
  });

  // The projection is the security boundary; a client that could write to it
  // could publish fields a member asked us to withhold.
  it('refuses every client write, including from an admin', async () => {
    await assertFails(setDoc(doc(asMember('bob', 'bob@example.com'), 'directory/bob'), { name: 'x' }));
    await assertFails(setDoc(doc(asMember('admin1', ADMIN), 'directory/bob'), { name: 'x' }));
    await assertFails(deleteDoc(doc(asMember('admin1', ADMIN), 'directory/bob')));
  });
});

describe('memberIndex — the access oracle', () => {
  it('lets a member read their own entry', async () => {
    await assertSucceeds(getDoc(doc(asMember('bob', 'bob@example.com'), 'memberIndex/bob')));
  });

  it('refuses reading someone else entry', async () => {
    await assertFails(getDoc(doc(asMember('bob', 'bob@example.com'), 'memberIndex/dana')));
  });

  // Writable memberIndex would mean self-granting directory access.
  it('refuses every client write', async () => {
    await assertFails(setDoc(doc(asMember('dana', 'dana@example.com'), 'memberIndex/dana'), { access: true }));
    await assertFails(setDoc(doc(asMember('admin1', ADMIN), 'memberIndex/dana'), { access: true }));
  });
});

describe('collections with no client access', () => {
  it('refuses reads of the unused members collection', async () => {
    await assertFails(getDoc(doc(asMember('bob', 'bob@example.com'), 'members/bob')));
  });

  it('refuses anything outside the declared collections', async () => {
    const db = asMember('bob', 'bob@example.com');
    await assertFails(getDoc(doc(db, 'somethingElse/x')));
    await assertFails(setDoc(doc(db, 'somethingElse/x'), { a: 1 }));
  });
});
