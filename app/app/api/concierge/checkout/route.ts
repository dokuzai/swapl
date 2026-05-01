// Concierge checkout — purchase a flat-fee add-on for a swap agreement, OR
// log + redirect for affiliate add-ons. Authorisation: only swap parties
// can buy for their own swap.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { startOneTimeCheckout } from "@/lib/billing/checkout";
import { isStripeConfigured, BillingNotConfigured } from "@/lib/billing/stripe";

const schema = z.object({
  agreementId: z.string().min(1),
  slug: z.string().min(1),
});

const PRICE_BY_SLUG: Record<string, string | undefined> = {
  // Map add-on slugs to Stripe price ids when they're priced > 0. Affiliate
  // add-ons skip this map and route through the affiliate redirector.
  "cleaning-mid": process.env.STRIPE_PRICE_ADDON_CLEANING,
  lockbox: process.env.STRIPE_PRICE_ADDON_LOCKBOX,
  "city-guide": process.env.STRIPE_PRICE_ADDON_CITY_GUIDE,
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [agreement, addOn] = await Promise.all([
    prisma.swapAgreement.findUnique({
      where: { id: parsed.data.agreementId },
      include: { listing1: true, listing2: true },
    }),
    prisma.addOn.findUnique({ where: { slug: parsed.data.slug } }),
  ]);
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  if (!addOn || !addOn.isActive) return NextResponse.json({ error: "Add-on not found" }, { status: 404 });

  const involved = new Set([agreement.listing1.userId, agreement.listing2.userId]);
  if (!involved.has(session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (addOn.type === "affiliate") {
    return NextResponse.json(
      { error: "Affiliate add-ons are linked through /api/affiliate/[slug] instead" },
      { status: 400 },
    );
  }

  // Stripe path
  const priceId = PRICE_BY_SLUG[addOn.slug];
  if (isStripeConfigured() && priceId) {
    try {
      const url = await startOneTimeCheckout({
        userId: session.userId,
        priceId,
        kind: "addon",
        metadata: { agreementId: agreement.id, addOnSlug: addOn.slug },
        successPath: `/swaps/${agreement.proposalId}/concierge`,
        cancelPath: `/swaps/${agreement.proposalId}/concierge`,
      });
      return NextResponse.json({ url, mode: "checkout" });
    } catch (err) {
      if (!(err instanceof BillingNotConfigured)) throw err;
    }
  }

  // Pre-launch path: record paid order so the UI flips state right away.
  const order = await prisma.orderAddOn.create({
    data: {
      userId: session.userId,
      agreementId: agreement.id,
      addOnId: addOn.id,
      status: "paid",
      amountCents: addOn.priceCents,
      stripePaymentIntentId: `pre_launch_${addOn.slug}_${Date.now()}`,
    },
  });

  sendEmail({
    to: session.email,
    subject: `Add-on confirmed: ${addOn.name}`,
    text: `Your ${addOn.name} for the swap to ${
      agreement.listing1.userId === session.userId ? agreement.listing2.city : agreement.listing1.city
    } is booked. Total €${(addOn.priceCents / 100).toFixed(2)}. We'll email logistics 48 h before your stay.`,
  }).catch((err) => console.error("[concierge:email]", err));

  return NextResponse.json({ ok: true, mode: "pre_launch", orderId: order.id });
}
