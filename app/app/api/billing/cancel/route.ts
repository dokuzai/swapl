import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStripe, BillingNotConfigured } from "@/lib/billing/stripe";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const sub = await prisma.subscription.findUnique({ where: { userId: session.userId } });
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription" }, { status: 404 });
  }
  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.subscription.update({
      where: { userId: session.userId },
      data: { cancelAtPeriodEnd: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
