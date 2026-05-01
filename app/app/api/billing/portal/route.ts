import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBillingPortalUrl } from "@/lib/billing/checkout";
import { BillingNotConfigured } from "@/lib/billing/stripe";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const url = await createBillingPortalUrl(session.userId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
