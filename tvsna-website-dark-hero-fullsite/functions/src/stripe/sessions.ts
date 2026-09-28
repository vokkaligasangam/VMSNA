/**
 * Checkout and Customer Portal sessions.
 *
 * Hosted Checkout rather than the embedded Payment Element, deliberately: card
 * details never touch vmsna.org, which keeps the organisation at PCI SAQ-A
 * rather than pulling its CSP, JS supply chain and deploy pipeline into scope.
 * For a volunteer-run nonprofit that is the single most important
 * consideration. It also gets SCA, wallets, dunning and invoice history at no
 * implementation cost.
 *
 * Approve-then-pay: only an approved applicant can open a checkout session.
 * Eligibility is a human judgement, and charging before it means volunteers
 * refunding people they have just told do not qualify.
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import type Stripe from "stripe";
import {
  STRIPE_SECRET_KEY,
  stripe,
  resolvePrice,
  siteOrigin,
  TIERS,
  DONATION_PRICE_LIMITS,
  type Currency,
  type Tier,
} from "./config.js";

interface MemberLookup {
  docId: string;
  data: FirebaseFirestore.DocumentData;
}

async function ownRecord(uid: string): Promise<MemberLookup> {
  const snap = await admin
    .firestore()
    .collection("membershipApplications")
    .where("userId", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError("not-found", "No membership application is attached to this account.");
  }
  return { docId: snap.docs[0].id, data: snap.docs[0].data() };
}

/**
 * Reuse the member's Stripe customer if they have one, otherwise create it.
 * The idempotency key means a double-click cannot produce two customers for
 * the same person.
 */
async function customerFor(
  uid: string,
  record: MemberLookup,
  email: string,
): Promise<string> {
  const existing = record.data.stripeCustomerId;
  if (typeof existing === "string" && existing) return existing;

  const customer = await stripe().customers.create(
    {
      email,
      name: record.data.name ?? undefined,
      metadata: { uid, applicationId: record.docId },
    },
    { idempotencyKey: `customer:${uid}` },
  );

  await admin
    .firestore()
    .collection("membershipApplications")
    .doc(record.docId)
    .update({ stripeCustomerId: customer.id });

  return customer.id;
}

function requireAuth(request: CallableRequest): { uid: string; email: string } {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!request.auth.token.email_verified) {
    throw new HttpsError("failed-precondition", "Please verify your email address first.");
  }
  return { uid: request.auth.uid, email: String(request.auth.token.email ?? "") };
}

export const createCheckoutSession = onCall(
  { region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { uid, email } = requireAuth(request);
    const tier = String(request.data?.tier ?? "") as Tier;
    const currency = String(request.data?.currency ?? "usd").toLowerCase() as Currency;

    const record = await ownRecord(uid);
    if (record.data.status !== "approved") {
      throw new HttpsError(
        "failed-precondition",
        "Your application has not been approved yet. We will email you when it has.",
      );
    }
    if (record.data.membership?.state === "active") {
      throw new HttpsError("already-exists", "This membership is already active.");
    }

    const price = resolvePrice(tier, currency);
    const customer = await customerFor(uid, record, email);
    const recurring = TIERS[tier].recurring;

    const session = await stripe().checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      customer,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      // Session metadata does not propagate to subscription-level events, so
      // the uid has to be stamped on the subscription too or the webhook
      // cannot attribute customer.subscription.* to a member.
      metadata: { uid, tier, applicationId: record.docId },
      ...(recurring
        ? { subscription_data: { metadata: { uid, tier, applicationId: record.docId } } }
        : { payment_intent_data: { metadata: { uid, tier, applicationId: record.docId } } }),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${siteOrigin()}/membership/welcome/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/membership/activate/?cancelled=1`,
    });

    logger.info(`Checkout session created for ${uid} (${tier}/${currency})`);
    return { url: session.url };
  },
);

export const createPortalSession = onCall(
  { region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { uid } = requireAuth(request);
    const record = await ownRecord(uid);
    const customer = record.data.stripeCustomerId;

    if (!customer) {
      throw new HttpsError("failed-precondition", "There is no billing record for this account yet.");
    }

    // The Customer Portal covers card updates, cancellation, and invoice
    // history, so none of that needs building or maintaining here.
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${siteOrigin()}/account/billing/`,
    });

    return { url: session.url };
  },
);

/**
 * Donations. Open to anyone, signed in or not — a donation is not membership
 * and never grants access. Kept entirely outside the membership state machine.
 */
export const createDonationSession = onCall(
  { region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const amount = Number(request.data?.amount);
    const recurring = request.data?.recurring === true;
    const currency = String(request.data?.currency ?? "usd").toLowerCase();

    if (!Number.isInteger(amount) || amount < DONATION_PRICE_LIMITS.min || amount > DONATION_PRICE_LIMITS.max) {
      throw new HttpsError(
        "invalid-argument",
        `Please choose an amount between $${DONATION_PRICE_LIMITS.min / 100} and $${DONATION_PRICE_LIMITS.max / 100}.`,
      );
    }
    if (!["usd", "cad"].includes(currency)) {
      throw new HttpsError("invalid-argument", "Unsupported currency.");
    }

    const uid = request.auth?.uid ?? null;

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amount,
        product_data: {
          name: recurring ? "Monthly donation to VMSNA" : "Donation to VMSNA",
        },
        ...(recurring ? { recurring: { interval: "month" as const } } : {}),
      },
    };

    const session = await stripe().checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      line_items: [lineItem],
      metadata: { kind: "donation", uid: uid ?? "anonymous" },
      ...(recurring ? { subscription_data: { metadata: { kind: "donation", uid: uid ?? "anonymous" } } } : {}),
      ...(request.auth?.token.email ? { customer_email: String(request.auth.token.email) } : {}),
      success_url: `${siteOrigin()}/donate/thank-you/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/donate/?cancelled=1`,
    });

    return { url: session.url };
  },
);
