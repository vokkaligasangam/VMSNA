/*
  Firebase client configuration.

  These values are public identifiers, not secrets — Firebase web apps are
  designed to ship them. Access control is enforced entirely by Firestore
  security rules. Defined once here rather than copy-pasted into every page,
  which is how the old site ended up with the same object in nine files.
*/
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getFunctions, type Functions } from 'firebase/functions';

const config = {
  apiKey: 'AIzaSyBtPNMDkpYpWDumVd5srmQR0RSJF9azdBA',
  authDomain: 'vmsna-e9bd0.firebaseapp.com',
  projectId: 'vmsna-e9bd0',
  storageBucket: 'vmsna-e9bd0.firebasestorage.app',
  messagingSenderId: '863778654324',
  appId: '1:863778654324:web:0be4038e6383505f86a921',
};

export function app(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

export function db(): Firestore {
  return getFirestore(app());
}

export function auth(): Auth {
  return getAuth(app());
}

export function functions(): Functions {
  return getFunctions(app(), 'us-central1');
}
