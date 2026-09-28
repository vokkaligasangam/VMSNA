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

let appCheckStarted = false;

/**
 * App Check, when a reCAPTCHA Enterprise site key is configured at build time.
 *
 * This is what actually protects the two unauthenticated write paths
 * (helpRequests and contactMessages) from automated abuse — security rules can
 * validate the shape of a submission but cannot tell a person from a script.
 *
 * Inert until PUBLIC_RECAPTCHA_SITE_KEY is set, so enabling it is a config
 * change and a console setting rather than a code change. Roll out in monitor
 * mode first: see docs/RUNBOOK-app-check.md.
 */
function startAppCheck(instance: FirebaseApp): void {
  const siteKey = import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey || appCheckStarted) return;
  appCheckStarted = true;
  import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(instance, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch((error) => {
      // Never block the page on App Check failing to load.
      console.warn('App Check did not initialise', error);
    });
}

export function app(): FirebaseApp {
  const instance = getApps()[0] ?? initializeApp(config);
  startAppCheck(instance);
  return instance;
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
