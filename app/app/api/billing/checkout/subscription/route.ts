import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { startSubscriptionCheckout } from "@/lib/billing/checkout";
import { BillingNotConfigured } from "@/lib/billing/stripe";

const schema = z.object({
  plan: z.enum(["plus", "pro"]),
  cycle: z.enum(["monthly", "yearly"]),
});

const PRICE_ENV: Record<"plus" | "pro", Record<"monthly" | "yearly", string>> = {
  plus: {
    monthly: "STRIPE_PRICE_PLUS_MONTHLY",
    yearly: "STRIPE_PRICE_PLUS_YEARLY",
  },
  pro: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    yearly: "STRIPE_PRICE_PRO_YEARLY",
  },
};

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { plan, cycle } = parsed.data;
  const priceId = process.env[PRICE_ENV[plan][cycle]];
  if (!priceId) {
    return NextResponse.json({ error: `Plan price ${plan}/${cycle} not configured` }, { status: 503 });
  }
  try {
    const url = await startSubscriptionCheckout({ userId: session.userId, priceId, trialDays: 14 });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
