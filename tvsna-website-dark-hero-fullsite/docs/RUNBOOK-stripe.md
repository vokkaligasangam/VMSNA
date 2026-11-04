# Runbook — membership payments

Everything in the codebase is built and typechecked. What remains needs a
Stripe account, so it cannot be done from the repository.

**The ordering in steps 7 and 8 is the part that matters.** Grandfather the
existing members *before* turning payment enforcement on. Reversed, roughly 500
people lose the member directory at the same moment.

## How it fits together

- `status` — eligibility. `pending` / `approved` / `rejected`, decided by a
  human on the committee. Unchanged from before Stripe existed, which is why
  the approval queue, the notification paths and both composite indexes keep
  working.
- `membership.state` — payment standing. Written only by the webhook and the
  daily reconciler.

Access is `status === 'approved' && membership.state ∈ {active, grace,
complimentary}` — defined once in `functions/src/lib/access.ts`, mirrored in
`web/src/lib/access.ts` and in `firestore.rules`.

**Approve-then-pay.** Only an approved applicant can open a checkout session.
Eligibility is a human judgement; charging first means volunteers refunding
people they have just told do not qualify.

## 1. Products and prices, in test mode

Stripe dashboard → Products. One product, **VMSNA Membership**, with recurring
annual prices for student, individual and family, and a one-time price for
life. Use each price's multi-currency option to add CAD; add INR to the life
price only.

Recurring card payments from Indian cards are unreliable under RBI e-mandate
rules, so India is offered life membership and one-time donations only. The
activation page enforces that and explains why. This is a payments-regulation
constraint, not something to work around.

A second product, **VMSNA Support**, is not needed — donations use
`price_data` created per session, so any amount works.

## 2. Configure the price IDs

The client sends `{ tier, currency }` and never a price ID or an amount, so a
tampered request can only select another legitimate price or be rejected.

```bash
cd tvsna-website-dark-hero-fullsite/functions
firebase functions:secrets:set STRIPE_SECRET_KEY        # sk_test_... for now
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # from step 4
```

Price IDs are environment-specific but not secret, so put them in
`functions/.env`:

```
STRIPE_PRICE_STUDENT_USD=price_...
STRIPE_PRICE_STUDENT_CAD=price_...
STRIPE_PRICE_INDIVIDUAL_USD=price_...
STRIPE_PRICE_INDIVIDUAL_CAD=price_...
STRIPE_PRICE_FAMILY_USD=price_...
STRIPE_PRICE_FAMILY_CAD=price_...
STRIPE_PRICE_LIFE_USD=price_...
STRIPE_PRICE_LIFE_CAD=price_...
STRIPE_PRICE_LIFE_INR=price_...
SITE_ORIGIN=https://vmsna.org
```

A missing price fails with a clear message naming the tier and currency rather
than a Stripe error.

## 3. Enable the Customer Portal

Stripe dashboard → Settings → Billing → Customer portal. Allow cancellation,
payment-method updates and invoice history. This is why `/account/billing/` is
a page with a paragraph and a button rather than a billing UI to maintain.

While you are there, set Smart Retries under Billing → Subscriptions →
Revenue recovery: four attempts over three weeks, then cancel. Stripe's dunning
does the recovery work; the code deliberately does not duplicate it.

## 4. Test the webhook locally

```bash
stripe listen --forward-to http://localhost:5001/vmsna-e9bd0/us-central1/stripeWebhook
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`, then walk the
whole lifecycle with `stripe trigger`:

| Trigger | Expected |
| --- | --- |
| `checkout.session.completed` | `membership.state` becomes `active`, `stripeCustomerId` set |
| `invoice.paid` | period end advances, a `payments/{invoiceId}` record appears, receipt email sent |
| `invoice.payment_failed` | state becomes `past_due` — **access is retained** |
| `customer.subscription.deleted` | state becomes `grace`, `graceEndsAt` 30 days out — access retained |
| `charge.refunded` | recorded in `payments`, membership unchanged, warning logged |

Then the two that are easy to get wrong and are the reason the ledger exists:

- **Replay a delivery** from the Stripe CLI. The second one must be
  acknowledged with 200 and ignored — check the log says "duplicate delivery".
- **Deliver out of order.** Send a `customer.subscription.updated` with an
  older `created` timestamp than the last processed event. It must be
  discarded, not applied. Without this a late event can silently revoke a
  paying member.

## 5. Register the live endpoint

Stripe dashboard → Developers → Webhooks → add
`https://vmsna.org/api/stripe/webhook`.

Use the organisation's own domain, not the `cloudfunctions.net` URL: the
Hosting rewrite keeps it stable across a region change or a function rename.

Subscribe to: `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, `invoice.paid`,
`invoice.payment_failed`, `charge.refunded`.

## 6. Deploy and take one real payment

```bash
npm --prefix functions run build
firebase deploy --only functions
npm --prefix web run build && firebase deploy --only hosting
```

Switch to live keys, then put one real low-value transaction through
end-to-end with a real card — your own. Confirm the receipt arrives, the
membership shows active on `/account/billing/`, and the Customer Portal opens.
Then refund it from the dashboard.

## 7. Grandfather the existing members — BEFORE step 8

Every current approved member becomes `complimentary`, so nobody who already
belongs is asked to pay for something they already had.

From `/admin/diagnostics/`, or the browser console signed in as an admin:

```js
const fn = httpsCallable(getFunctions(undefined,'us-central1'), 'grandfatherMemberships');
(await fn({ dryRun: true })).data;
```

Read the report. `approved` should match the number of members you expect, and
`wouldGrandfather` should be almost all of them. Then:

```js
(await fn({ dryRun: false })).data;
```

Spot-check several members in the console: each should now have
`membership.state = "complimentary"`, `grandfathered: true`, and a
`currentPeriodEnd` at the end of next year.

## 8. Only now, turn enforcement on

```bash
# functions
firebase functions:config:set  # or set ENFORCE_MEMBERSHIP_PAYMENT=true in functions/.env
# web, so the UI agrees with the server
echo 'PUBLIC_ENFORCE_MEMBERSHIP_PAYMENT=true' >> web/.env

npm --prefix functions run build && firebase deploy --only functions
npm --prefix web run build && firebase deploy --only hosting
```

Then **immediately** verify with a grandfathered member's account that
`/directory/` still loads. If it does not, set the flag back to `false` and
redeploy — that is the whole rollback, and it takes about two minutes.

The directory projection reruns automatically on the next write to each
member, but to be certain, run `rebuildDirectory` from `/admin/diagnostics/`
(dry run first) after flipping the flag.

## Ongoing

`reconcileSubscriptions` runs daily at 03:00 Pacific. It pulls authoritative
state from Stripe and repairs Firestore where they disagree, expires anyone
past their grace period, and sends renewal reminders at 30, 7 and 1 days.

It is the only thing that ever downgrades a member. No single webhook event
revokes access — which is what makes a webhook outage a delay rather than a
lockout.

Check `stripeEventFailures` occasionally. Anything with a rising `attempts`
count is an event Stripe keeps retrying and the handler keeps rejecting.
