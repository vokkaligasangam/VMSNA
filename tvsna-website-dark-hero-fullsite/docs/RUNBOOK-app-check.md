# Runbook — enabling App Check

`helpRequests` and `contactMessages` accept writes from anyone, signed in or
not, because a family asking for help should not have to make an account
first. Security rules validate the shape and size of a submission, but they
cannot tell a person from a script. App Check is what closes that.

The client hook is already in place in `web/src/lib/firebase.ts` and stays inert
until a site key is configured, so this is a console and config exercise.

## 1. Create a reCAPTCHA Enterprise key

Google Cloud console → Security → reCAPTCHA Enterprise → create a key for
websites, domain `vmsna.org`. Copy the site key (it is public).

## 2. Register it with App Check

Firebase console → App Check → the web app → reCAPTCHA Enterprise → paste the
site key.

## 3. Build with the key

```bash
echo 'PUBLIC_RECAPTCHA_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxx' >> web/.env
npm --prefix web run build
firebase deploy --only hosting
```

`.env` is gitignored. In CI, set it as a build secret.

## 4. Monitor before enforcing

In App Check, leave Firestore and Cloud Functions **unenforced** for about two
weeks and watch the metrics. The number to look at is the share of requests
arriving without a valid token: that is what enforcement would have blocked.

Expect a non-zero figure. Anything still using the legacy pages, any admin
script, and local development without a debug token all appear as unverified.

## 5. Enforce

Once unverified traffic is close to zero, enforce for Firestore first, then
Cloud Functions. Enforce one at a time so a regression is easy to attribute.

## Local development

Enforcement breaks `astro dev` unless the browser has a debug token. In the
browser console, before loading Firebase:

```js
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
```

Reload, copy the token printed to the console, and register it in Firebase
console → App Check → Manage debug tokens. Do this per browser profile.

## Scripts

Anything using the Admin SDK — `bootstrap-roles.mjs`, the Cloud Functions
themselves — bypasses App Check entirely. Only web-SDK clients are affected.
