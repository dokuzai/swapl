// Typed wrappers around Stripe Checkout for the v1 monetization features.
// Each function:
//   - Resolves or creates a StripeCustomer linked to our User row.
//   - Always passes automatic_tax + customer_update so Stripe handles VAT.
//   - Returns the hosted Checkout URL (caller redirects).

import "server-only";
import type Stripe from "stripe";
import { getStripe, BillingNotConfigured } from "./stripe";
import { prisma } from "@/lib/db";
import { marketingUrl } from "@/lib/marketing/urls";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function ensureStripeCustomer(userId: string): Promise<string> {
  const existing = await prisma.stripeCustomer.findUnique({ where: { userId } });
  if (existing) return existing.stripeId;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("user not found");

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.stripeCustomer.create({
    data: { userId, stripeId: customer.id, email: user.email },
  });
  return customer.id;
}

// Accepts app-relative paths or absolute URLs (e.g. the marketing site's
// pricing page) for the Stripe return destinations.
const absolute = (pathOrUrl: string) =>
  pathOrUrl.startsWith("http") ? pathOrUrl : `${APP_URL}${pathOrUrl}`;

const baseSession = (
  customerId: string,
  successPath: string,
  cancelPath: string
): Pick<Stripe.Checkout.SessionCreateParams, "customer" | "automatic_tax" | "customer_update" | "success_url" | "cancel_url" | "billing_address_collection"> => ({
  customer: customerId,
  automatic_tax: { enabled: true },
  customer_update: { address: "auto", name: "auto" },
  billing_address_collection: "auto",
  success_url: `${absolute(successPath)}?status=ok&session={CHECKOUT_SESSION_ID}`,
  cancel_url: `${absolute(cancelPath)}?status=cancel`,
});

export async function startSubscriptionCheckout(opts: {
  userId: string;
  priceId: string;
  trialDays?: number;
}): Promise<string> {
  if (!opts.priceId) throw new BillingNotConfigured("subscribe (no price id)");
  const customerId = await ensureStripeCustomer(opts.userId);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: opts.trialDays,
      metadata: { userId: opts.userId, kind: "membership" },
    },
    metadata: { userId: opts.userId, kind: "membership" },
    ...baseSession(customerId, "/account/billing", marketingUrl("/pricing")),
  });
  if (!session.url) throw new Error("Stripe returned no Checkout URL");
  return session.url;
}

export async function startOneTimeCheckout(opts: {
  userId: string;
  priceId: string;
  kind: "verify_listing" | "feature_listing_14d" | "feature_listing_30d" | "addon" | "insurance_upgrade";
  metadata?: Record<string, string>;
  successPath?: string;
  cancelPath?: string;
}): Promise<string> {
  if (!opts.priceId) throw new BillingNotConfigured(`one-time checkout (${opts.kind})`);
  const customerId = await ensureStripeCustomer(opts.userId);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    payment_intent_data: { metadata: { userId: opts.userId, kind: opts.kind, ...(opts.metadata ?? {}) } },
    metadata: { userId: opts.userId, kind: opts.kind, ...(opts.metadata ?? {}) },
    ...baseSession(
      customerId,
      opts.successPath ?? "/account/billing",
      opts.cancelPath ?? "/account/billing"
    ),
  });
  if (!session.url) throw new Error("Stripe returned no Checkout URL");
  return session.url;
}

export async function startCorporateCheckout(opts: {
  email: string;
  companyName: string;
  seatCount: number;
  priceId: string;
}): Promise<string> {
  if (!opts.priceId) throw new BillingNotConfigured("corporate checkout");
  if (opts.seatCount < 5) throw new Error("Corporate plan requires a minimum of 5 seats.");
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: opts.email,
    name: opts.companyName,
    metadata: { kind: "corporate", companyName: opts.companyName },
  });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: opts.priceId, quantity: opts.seatCount }],
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "auto",
    metadata: { kind: "corporate", companyName: opts.companyName, seatCount: String(opts.seatCount) },
    subscription_data: {
      metadata: { kind: "corporate", companyName: opts.companyName, seatCount: String(opts.seatCount) },
    },
    success_url: `${APP_URL}/corporate/success?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/corporate?status=cancel`,
  });
  if (!session.url) throw new Error("Stripe returned no Checkout URL");
  return session.url;
}

export async function createBillingPortalUrl(userId: string): Promise<string> {
  const customer = await prisma.stripeCustomer.findUnique({ where: { userId } });
  if (!customer) throw new BillingNotConfigured("open billing portal (no Stripe customer)");
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.stripeId,
    return_url: `${APP_URL}/account/billing`,
  });
  return portal.url;
}
