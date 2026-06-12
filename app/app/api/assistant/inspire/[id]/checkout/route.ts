// POST /api/assistant/inspire/{id}/checkout — start the pay-on-accept flow
// for a draft package.
//
// NO charge happens here (or at confirm): when there are payable items
// (selected concierge add-ons, priceCents > 0) and Stripe is configured, we
// create a SetupIntent (usage: off_session) so the card is saved. The
// off-session PaymentIntent is created ONLY when the host accepts — "You'll
// only be charged if the host accepts."
//
// Without Stripe, or with zero payable items: { paymentRequired: false } and
// the flow continues without a payment step.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { payableSummary, type InspirePayload } from "@/lib/ai/inspire";
import { INSPIRE_PI_KIND } from "@/lib/billing/inspire";

export async function POST(req: Request, { params }: RouteContext<"/api/assistant/inspire/[id]/checkout">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const pkg = await prisma.inspirationPackage.findUnique({ where: { id } });
  if (!pkg || pkg.userId !== session.userId) return notFound("Package not found");
  if (pkg.status !== "draft") {
    return unprocessable("PACKAGE_NOT_DRAFT", { message: `This package is already ${pkg.status}.` });
  }

  let payload: InspirePayload;
  try {
    payload = JSON.parse(pkg.payload);
  } catch {
    return unprocessable("PACKAGE_CORRUPT");
  }

  const { payableItems, totalCents, currency } = payableSummary(payload);
  const summary = {
    payableItems: payableItems.map((a) => ({ id: a.id, slug: a.slug, name: a.name, priceCents: a.priceCents })),
    totalCents,
    currency,
  };

  // Env-gated degrade: no Stripe or nothing payable → no payment step at all.
  if (totalCents <= 0 || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ paymentRequired: false, summary });
  }

  // Lazy imports keep the Stripe SDK ("server-only") out of test module graphs.
  const [{ getStripe }, { ensureStripeCustomer }] = await Promise.all([
    import("@/lib/billing/stripe"),
    import("@/lib/billing/checkout"),
  ]);
  const customerId = await ensureStripeCustomer(session.userId);
  const stripe = getStripe();

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    metadata: { kind: INSPIRE_PI_KIND, packageId: pkg.id, userId: session.userId },
  });

  await prisma.inspirationPackage.update({
    where: { id: pkg.id },
    data: { setupIntentId: setupIntent.id, paymentStatus: "none" },
  });

  return NextResponse.json({
    paymentRequired: true,
    clientSecret: setupIntent.client_secret,
    summary,
    note: "You'll only be charged if the host accepts.",
  });
}
