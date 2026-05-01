import { NextResponse } from "next/server";
import { z } from "zod";
import { startCorporateCheckout } from "@/lib/billing/checkout";
import { isStripeConfigured, BillingNotConfigured } from "@/lib/billing/stripe";

const schema = z.object({
  companyName: z.string().min(2),
  email: z.string().email(),
  seatCount: z.number().int().min(5).max(2000),
});

const PRICE = process.env.STRIPE_PRICE_CORPORATE_SEAT ?? "";

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (!isStripeConfigured() || !PRICE) {
    return NextResponse.json(
      { error: "Self-serve corporate checkout opens at launch. Use the lead form below." },
      { status: 503 },
    );
  }
  try {
    const url = await startCorporateCheckout({
      email: parsed.data.email,
      companyName: parsed.data.companyName,
      seatCount: parsed.data.seatCount,
      priceId: PRICE,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
