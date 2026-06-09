// Server-only Stripe instance. Throws a clear, typed error when keys aren't
// configured so feature flags can render an "Available soon" CTA instead of
// a 500.
//
// IMPORTANT: never import this from a Client Component. Stripe's secret key
// must never reach the browser.

import "server-only";
import Stripe from "stripe";

export class BillingNotConfigured extends Error {
  constructor(public readonly feature: string) {
    super(`Stripe is not configured: cannot ${feature}.`);
    this.name = "BillingNotConfigured";
  }
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfigured("connect to Stripe");
  cached = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
    appInfo: { name: "swapl", version: "1.0.0" },
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
