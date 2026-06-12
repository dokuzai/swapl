// Stripe webhook entry point.
//
// Two non-negotiables:
//   1. Raw body — signature verification fails if Next parses the JSON. We use
//      `await req.text()` and a "force-dynamic"/"nodejs" runtime.
//   2. Idempotency — every event id is recorded in BillingEvent and dropped on
//      replay. Stripe replays freely; we must never double-bill or
//      double-grant entitlements.
//
// Handlers below are intentionally narrow: they touch only domain rows.
// All Stripe-side logic (proration, price math, invoice PDFs) stays inside
// Stripe; we mirror state, we don't re-derive it.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, STRIPE_WEBHOOK_SECRET, BillingNotConfigured } from "@/lib/billing/stripe";
import {
  reconcilePaymentIntent,
  reconcilePaymentIntentFailed,
  reconcileRefund,
  reconcileSetupIntent,
} from "@/lib/billing/reconcile";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 503 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe:webhook] signature failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: drop replays after first handle.
  const seen = await prisma.billingEvent.findUnique({ where: { stripeId: event.id } });
  if (seen) return NextResponse.json({ ok: true, replay: true });
  await prisma.billingEvent.create({
    data: { stripeId: event.id, type: event.type, payload: JSON.stringify(event) },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
      case "invoice.payment_failed":
        await handleInvoice(event.data.object as Stripe.Invoice);
        break;

      case "payment_intent.succeeded":
        await reconcilePaymentIntent(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await reconcilePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "setup_intent.succeeded":
        await reconcileSetupIntent(event.data.object as Stripe.SetupIntent);
        break;

      case "refund.created":
        await reconcileRefund(event.data.object as Stripe.Refund);
        break;

      // Future:
      //   payout.paid → ledger entry
      default:
        // Unhandled events are still recorded above for replay debugging.
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stripe:webhook] handler failed", event.type, err);
    // Returning 500 makes Stripe retry. That's the right behaviour for
    // transient DB failures — but means handlers MUST be idempotent against
    // their own writes too (Subscription is keyed by stripeSubscriptionId,
    // OrderAddOn by stripePaymentIntentId, etc.).
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}

// ---- Handlers ----

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // For subscription mode, the "customer.subscription.created" event handles
  // domain state. Here we only need to upsert the StripeCustomer link if the
  // session was anonymous (corporate sign-up creates a new customer).
  const userId = session.metadata?.userId;
  const kind = session.metadata?.kind;
  if (userId && session.customer && typeof session.customer === "string") {
    await prisma.stripeCustomer.upsert({
      where: { userId },
      create: { userId, stripeId: session.customer, email: session.customer_details?.email ?? "" },
      update: { stripeId: session.customer },
    });
  }
  // Corporate subscriptions: stash the lead-to-org link by metadata so the
  // post-payment redirect can finalise the Organization row.
  if (kind === "corporate" && session.subscription) {
    // Will be picked up by handleSubscriptionChange + a follow-up job in
    // Feature 5 work — out of scope for this groundwork commit.
  }
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  // We assume one subscription per User (membership v1). Corporate
  // subscriptions are routed via metadata.kind === "corporate" and live in
  // the Organization model — handled by Feature 5.
  const kind = sub.metadata?.kind;
  if (kind === "corporate") return; // Feature 5 wires this.

  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("[stripe:webhook] subscription without userId metadata", sub.id);
    return;
  }

  // Resolve plan from the Stripe price id.
  const priceId = sub.items.data[0]?.price.id;
  const plan = await prisma.plan.findFirst({
    where: {
      OR: [{ stripePriceMonthly: priceId }, { stripePriceYearly: priceId }],
    },
  });
  if (!plan) {
    console.warn("[stripe:webhook] no Plan matches price", priceId);
    return;
  }

  const status = sub.status; // "active" | "past_due" | "canceled" | "trialing" | "unpaid" | "incomplete"
  const item = sub.items.data[0];
  const currentPeriodStart = new Date((item?.current_period_start ?? sub.created) * 1000);
  const currentPeriodEnd = new Date((item?.current_period_end ?? sub.created) * 1000);

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart,
      currentPeriodEnd,
    },
    update: {
      planId: plan.id,
      stripeSubscriptionId: sub.id,
      status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart,
      currentPeriodEnd,
    },
  });
}

async function handleInvoice(invoice: Stripe.Invoice) {
  if (!invoice.id) return;
  const stripeCustomer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomer) return;
  const customer = await prisma.stripeCustomer.findUnique({ where: { stripeId: stripeCustomer } });
  if (!customer) return;
  await prisma.billingInvoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      userId: customer.userId,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      status: invoice.status ?? "open",
      pdfUrl: invoice.invoice_pdf ?? null,
    },
    update: {
      status: invoice.status ?? "open",
      amountCents: invoice.amount_paid,
      pdfUrl: invoice.invoice_pdf ?? null,
    },
  });
}
