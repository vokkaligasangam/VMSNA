import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { HttpsError } from "firebase-functions/v2/https";

export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(STRIPE_SECRET_KEY.value(), {
    // Pinned deliberately. An unpinned version means Stripe can change the
    // shape of a webhook payload under a running deployment.
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: "VMSNA", url: "https://vmsna.org" },
  });
  return cached;
}

export type Tier = "student" | "individual" | "family" | "life";
export type Currency = "usd" | "cad" | "inr";

/**
 * Price catalogue.
 *
 * The client sends { tier, currency } and never a price ID or an amount, so a
 * tampered request can only ever select another legitimate price or be
 * rejected. The IDs come from environment configuration because they differ
 * between Stripe test mode and live mode.
 *
 * Set them with, e.g.:
 *   firebase functions:secrets:set STRIPE_PRICE_FAMILY_USD
 * or as plain env vars in .env for the emulator — they are not secrets, just
 * environment-specific.
 */
function priceId(tier: Tier, currency: Currency): string | undefined {
  return process.env[`STRIPE_PRICE_${tier.toUpperCase()}_${currency.toUpperCase()}`];
}

export const TIERS: Record<Tier, { label: string; recurring: boolean }> = {
  student: { label: "Student", recurring: true },
  individual: { label: "Individual", recurring: true },
  family: { label: "Family", recurring: true },
  life: { label: "Life", recurring: false },
};

/**
 * India is limited to the one-time Life membership on purpose. RBI e-mandate
 * rules make recurring card subscriptions from a US Stripe account to Indian
 * cards unreliable, so offering them would mean a steady trickle of silently
 * failing renewals. This is a payments-regulation constraint, not something to
 * engineer around.
 */
export function assertTierAvailable(tier: Tier, currency: Currency): void {
  if (!TIERS[tier]) {
    throw new HttpsError("invalid-argument", `Unknown membership tier "${tier}".`);
  }
  if (currency === "inr" && TIERS[tier].recurring) {
    throw new HttpsError(
      "failed-precondition",
      "Recurring memberships cannot be billed to Indian cards. Please choose Life membership.",
    );
  }
}

export function resolvePrice(tier: Tier, currency: Currency): string {
  assertTierAvailable(tier, currency);
  const id = priceId(tier, currency);
  if (!id) {
    throw new HttpsError(
      "failed-precondition",
      `No Stripe price is configured for ${tier}/${currency}. See docs/RUNBOOK-stripe.md.`,
    );
  }
  return id;
}

export const DONATION_PRICE_LIMITS = { min: 500, max: 2_000_000 }; // cents

export function siteOrigin(): string {
  return process.env.SITE_ORIGIN || "https://vmsna.org";
}
