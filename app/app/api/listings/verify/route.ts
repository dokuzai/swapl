// Submit a listing for paid verification.
//
// Two ways to flow:
//   1. Stripe configured → returns Checkout URL; on payment_intent.succeeded
//      the webhook flips Listing.verificationStatus to "pending" and the
//      admin queue picks it up.
//   2. Stripe not configured (current state) → records the submission
//      *immediately* as pending so we can demo the admin review flow without
//      money. The DB still tracks the missing payment via
//      ListingVerificationPayment with stripePaymentIntentId set to a
//      placeholder so the seam is obvious.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { startOneTimeCheckout } from "@/lib/billing/checkout";
import { isStripeConfigured, BillingNotConfigured } from "@/lib/billing/stripe";

const schema = z.object({
  listingId: z.string().min(1),
  videoUrl: z.string().url(),
});

const VERIFY_PRICE_ID = process.env.STRIPE_PRICE_VERIFY_LISTING ?? "";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing || listing.userId !== session.userId) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.verificationStatus === "pending" || listing.isVerified) {
    return NextResponse.json({ error: "Already submitted or verified" }, { status: 409 });
  }

  // Path 1 — Stripe configured: paid checkout, webhook moves us forward.
  if (isStripeConfigured() && VERIFY_PRICE_ID) {
    try {
      const url = await startOneTimeCheckout({
        userId: session.userId,
        priceId: VERIFY_PRICE_ID,
        kind: "verify_listing",
        metadata: { listingId: listing.id, videoUrl: parsed.data.videoUrl },
        successPath: `/listings/${listing.id}/edit/verify`,
        cancelPath: `/listings/${listing.id}/edit/verify`,
      });
      return NextResponse.json({ url, mode: "checkout" });
    } catch (err) {
      if (!(err instanceof BillingNotConfigured)) throw err;
    }
  }

  if (process.env.ALLOW_PRELAUNCH_BILLING_BYPASS !== "1") {
    return NextResponse.json({ error: "Listing verification checkout is not configured." }, { status: 503 });
  }

  // Path 2 — explicit pre-launch: record pending state directly so admins can review
  // immediately. Replace with Path 1 the moment STRIPE_SECRET_KEY ships.
  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      verificationStatus: "pending",
      verificationVideoUrl: parsed.data.videoUrl,
      verificationSubmittedAt: new Date(),
    },
  });
  await prisma.listingVerificationPayment.upsert({
    where: { listingId: listing.id },
    create: {
      listingId: listing.id,
      amountCents: 3900,
      stripePaymentIntentId: `pre_launch_${listing.id}`,
    },
    update: {},
  });

  sendEmail({
    to: "verify@swapl.test",
    subject: `New verification request: ${listing.title}`,
    text: `${session.email} submitted ${listing.title} for verification.\n\nVideo: ${parsed.data.videoUrl}\nReview at /admin/verifications`,
  }).catch((err) => console.error("[verify:notify-admin]", err));

  return NextResponse.json({ ok: true, mode: "pre_launch" });
}
