// Reconcile one-time Stripe payments (and their refunds) into domain rows.
// Called from the webhook (app/api/billing/webhook/route.ts).
//
// Contracts:
//   - Idempotent: Stripe replays events and the webhook retries on 500, so
//     every handler must tolerate being run twice for the same intent.
//   - Metadata-driven: PaymentIntents are created via startOneTimeCheckout
//     (lib/billing/checkout.ts) which stamps `kind` + feature-specific keys
//     (listingId, agreementId, addOnSlug, ...) on payment_intent_data.
//   - Narrow: we mirror Stripe state onto domain rows; we never call back
//     into Stripe from here.

import type Stripe from "stripe";
import { prisma, parseJSON } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { selectedPayableAddOns, type InspirePayload } from "@/lib/ai/inspire";

export async function reconcilePaymentIntent(intent: Stripe.PaymentIntent): Promise<void> {
  const kind = intent.metadata?.kind;
  if (!kind) return; // not one of ours (e.g. subscription invoice PI)

  switch (kind) {
    case "verify_listing":
      return reconcileVerifyListing(intent);
    case "feature_listing_14d":
      return reconcileFeatureListing(intent, 14);
    case "feature_listing_30d":
      return reconcileFeatureListing(intent, 30);
    case "addon":
      return reconcileAddOn(intent);
    case "inspire_package":
      return reconcileInspirePackage(intent);
    default:
      // insurance_upgrade etc. reconcile in their own feature routes.
      console.log("[stripe:webhook] one-time PI without reconciler", kind, intent.id);
  }
}

// payment_intent.payment_failed — the off-session pay-on-accept charge for an
// inspiration package failed asynchronously. Mirror the failure on the
// package; the swap itself is NOT touched (acceptance stands, payment is
// recovered out-of-band).
export async function reconcilePaymentIntentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  if (intent.metadata?.kind !== "inspire_package") return;
  const { packageId } = intent.metadata;
  if (!packageId) return;
  console.error("[stripe:webhook] inspire_package charge FAILED", packageId, intent.id);
  await prisma.inspirationPackage.updateMany({
    where: { id: packageId, paymentStatus: { not: "charged" } },
    data: { paymentStatus: "failed" },
  });
}

// setup_intent.succeeded — the member saved a card at the inspire checkout.
// Stamp the payment method on the package: paymentStatus "saved" means "may
// be charged off-session when the host accepts" (and nothing before that).
export async function reconcileSetupIntent(si: Stripe.SetupIntent): Promise<void> {
  if (si.metadata?.kind !== "inspire_package") return;
  const { packageId } = si.metadata;
  if (!packageId) return;
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (!pm) return;
  await prisma.inspirationPackage.updateMany({
    where: { id: packageId, paymentStatus: "none" },
    data: { paymentMethodId: pm, paymentStatus: "saved" },
  });
}

// refund.created — flip the matching domain row(s) to refunded. A refund only
// carries the payment_intent id, so we probe all three one-time tables; the
// unique stripePaymentIntentId columns guarantee at most one hit each.
export async function reconcileRefund(refund: Stripe.Refund): Promise<void> {
  const intentId =
    typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (!intentId) return;

  await prisma.orderAddOn.updateMany({
    where: { stripePaymentIntentId: intentId },
    data: { status: "refunded" },
  });
  await prisma.listingVerificationPayment.updateMany({
    where: { stripePaymentIntentId: intentId },
    data: { refunded: true },
  });

  const purchase = await prisma.listingFeaturedPurchase.findUnique({
    where: { stripePaymentIntentId: intentId },
  });
  if (!purchase) return;

  await prisma.listingFeaturedPurchase.update({
    where: { id: purchase.id },
    data: { refunded: true },
  });
  // Recompute the listing's featured window from the remaining live
  // purchases, so refunding one of several stacked purchases keeps the rest.
  const live = await prisma.listingFeaturedPurchase.findFirst({
    where: { listingId: purchase.listingId, refunded: false, endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" },
  });
  await prisma.listing.update({
    where: { id: purchase.listingId },
    data: live
      ? { isFeatured: true, featuredUntil: live.endsAt }
      : { isFeatured: false, featuredUntil: null },
  });
}

// ---- per-kind handlers ----

// €39 verification: record the payment and flip the listing to "pending" so
// the admin review queue (/admin/verifications) picks it up. Mirrors the
// pre-launch path in app/api/listings/verify/route.ts.
async function reconcileVerifyListing(intent: Stripe.PaymentIntent): Promise<void> {
  const { listingId, videoUrl } = intent.metadata;
  if (!listingId) {
    console.warn("[stripe:webhook] verify_listing PI without listingId", intent.id);
    return;
  }
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    console.warn("[stripe:webhook] verify_listing PI for unknown listing", listingId, intent.id);
    return;
  }

  // Upsert by listingId: replaces the `pre_launch_*` placeholder if the
  // submission predates Stripe, and is a no-op on event replay.
  await prisma.listingVerificationPayment.upsert({
    where: { listingId },
    create: {
      listingId,
      amountCents: intent.amount_received || intent.amount,
      stripePaymentIntentId: intent.id,
    },
    update: { stripePaymentIntentId: intent.id, refunded: false },
  });

  // Don't touch listings already in (or past) review — replays and races with
  // the admin queue must not reopen a decided verification.
  if (listing.verificationStatus === "none" || listing.verificationStatus === "rejected") {
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        verificationStatus: "pending",
        verificationVideoUrl: videoUrl ?? listing.verificationVideoUrl,
        verificationSubmittedAt: new Date(),
      },
    });
    sendEmail({
      to: "verify@swapl.test",
      subject: `New verification request: ${listing.title}`,
      text: `Paid verification for ${listing.title} (${listingId}).\n\nVideo: ${videoUrl ?? "n/a"}\nReview at /admin/verifications`,
    }).catch((err) => console.error("[verify:notify-admin]", err));
  }
}

// Featured Placement (14d / 30d): record the purchase and light the listing
// up. Stacked purchases extend rather than shorten the window.
async function reconcileFeatureListing(
  intent: Stripe.PaymentIntent,
  durationDays: 14 | 30
): Promise<void> {
  const { listingId } = intent.metadata;
  if (!listingId) {
    console.warn("[stripe:webhook] feature_listing PI without listingId", intent.id);
    return;
  }

  // Replay guard: stripePaymentIntentId is unique, one purchase per PI.
  const existing = await prisma.listingFeaturedPurchase.findUnique({
    where: { stripePaymentIntentId: intent.id },
  });
  if (existing) return;

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    console.warn("[stripe:webhook] feature_listing PI for unknown listing", listingId, intent.id);
    return;
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const featuredUntil =
    listing.featuredUntil && listing.featuredUntil > endsAt ? listing.featuredUntil : endsAt;

  await prisma.$transaction([
    prisma.listingFeaturedPurchase.create({
      data: {
        listingId,
        durationDays,
        amountCents: intent.amount_received || intent.amount,
        startsAt,
        endsAt,
        stripePaymentIntentId: intent.id,
      },
    }),
    prisma.listing.update({
      where: { id: listingId },
      data: { isFeatured: true, featuredUntil },
    }),
  ]);
}

// Concierge add-on: record the paid order. Mirrors the pre-launch path in
// app/api/concierge/checkout/route.ts.
async function reconcileAddOn(intent: Stripe.PaymentIntent): Promise<void> {
  const { userId, agreementId, addOnSlug } = intent.metadata;
  if (!userId || !agreementId || !addOnSlug) {
    console.warn("[stripe:webhook] addon PI with incomplete metadata", intent.id);
    return;
  }

  // Replay guard: one order per PI.
  const existing = await prisma.orderAddOn.findFirst({
    where: { stripePaymentIntentId: intent.id },
  });
  if (existing) return;

  const addOn = await prisma.addOn.findUnique({ where: { slug: addOnSlug } });
  if (!addOn) {
    console.warn("[stripe:webhook] addon PI for unknown slug", addOnSlug, intent.id);
    return;
  }

  await prisma.orderAddOn.create({
    data: {
      userId,
      agreementId,
      addOnId: addOn.id,
      status: "paid",
      amountCents: intent.amount_received || intent.amount,
      stripePaymentIntentId: intent.id,
    },
  });
}

// Pay-on-accept charge for a "Get Inspired" package (DOK-148): one PI covers
// all selected concierge add-ons of the package. Create the paid OrderAddOn
// rows (one per add-on, mirroring reconcileAddOn) and mark the package
// charged. Affiliate items are never part of this PI.
async function reconcileInspirePackage(intent: Stripe.PaymentIntent): Promise<void> {
  const { packageId } = intent.metadata;
  if (!packageId) {
    console.warn("[stripe:webhook] inspire_package PI without packageId", intent.id);
    return;
  }

  // Replay guard: the PI is reconciled once — any order row carrying its id
  // means we already created the full set.
  const existing = await prisma.orderAddOn.findFirst({
    where: { stripePaymentIntentId: intent.id },
  });
  if (existing) return;

  const pkg = await prisma.inspirationPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.proposalId) {
    console.warn("[stripe:webhook] inspire_package PI for unknown/unconfirmed package", packageId, intent.id);
    return;
  }

  const payload = parseJSON<Pick<InspirePayload, "addOns"> | null>(pkg.payload, null);
  const items = payload ? selectedPayableAddOns(payload) : [];

  // The agreement exists because the PI is only created on accept.
  const agreement = await prisma.swapAgreement.findUnique({ where: { proposalId: pkg.proposalId } });
  if (!agreement) {
    console.warn("[stripe:webhook] inspire_package PI without agreement", packageId, intent.id);
    return;
  }

  for (const item of items) {
    const addOn = await prisma.addOn.findUnique({ where: { slug: item.slug } });
    if (!addOn) {
      console.warn("[stripe:webhook] inspire_package PI references unknown add-on", item.slug, intent.id);
      continue;
    }
    await prisma.orderAddOn.create({
      data: {
        userId: pkg.userId,
        agreementId: agreement.id,
        addOnId: addOn.id,
        status: "paid",
        amountCents: item.priceCents,
        stripePaymentIntentId: intent.id,
        notes: `inspire_package:${pkg.id}`,
      },
    });
  }

  await prisma.inspirationPackage.updateMany({
    where: { id: pkg.id },
    data: { paymentStatus: "charged" },
  });
}
