// Buy a Featured Placement (14d / 30d) for a listing the caller owns.
//
// Behaviour mirrors the verify route: Stripe-paid when configured, otherwise
// records an active featured purchase immediately so the rank-band changes
// can be demoed without money.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { startOneTimeCheckout } from "@/lib/billing/checkout";
import { isStripeConfigured, BillingNotConfigured } from "@/lib/billing/stripe";

const schema = z.object({
  listingId: z.string().min(1),
  durationDays: z.union([z.literal(14), z.literal(30)]),
});

const PRICE_ENV = {
  14: "STRIPE_PRICE_FEATURED_14D",
  30: "STRIPE_PRICE_FEATURED_30D",
} as const;
const AMOUNT_CENTS = { 14: 1900, 30: 2900 } as const;

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing || listing.userId !== session.userId) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Per-city cap is enforced at query time, not at purchase time, so users
  // never get blocked from buying. The renderer demotes overflow.
  // Stripe path:
  const priceId = process.env[PRICE_ENV[parsed.data.durationDays]];
  if (isStripeConfigured() && priceId) {
    try {
      const url = await startOneTimeCheckout({
        userId: session.userId,
        priceId,
        kind: parsed.data.durationDays === 14 ? "feature_listing_14d" : "feature_listing_30d",
        metadata: {
          listingId: listing.id,
          durationDays: String(parsed.data.durationDays),
        },
        successPath: `/listings/${listing.id}/edit/featured`,
        cancelPath: `/listings/${listing.id}/edit/featured`,
      });
      return NextResponse.json({ url, mode: "checkout" });
    } catch (err) {
      if (!(err instanceof BillingNotConfigured)) throw err;
    }
  }

  if (process.env.ALLOW_PRELAUNCH_BILLING_BYPASS !== "1") {
    return NextResponse.json({ error: "Featured checkout is not configured." }, { status: 503 });
  }

  // Explicit pre-launch path: activate immediately.
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationDays * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listing.id },
      data: { isFeatured: true, featuredUntil: endsAt },
    }),
    prisma.listingFeaturedPurchase.create({
      data: {
        listingId: listing.id,
        durationDays: parsed.data.durationDays,
        amountCents: AMOUNT_CENTS[parsed.data.durationDays],
        startsAt,
        endsAt,
        stripePaymentIntentId: `pre_launch_${listing.id}_${startsAt.getTime()}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, mode: "pre_launch", endsAt: endsAt.toISOString() });
}
