import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { startSubscriptionCheckout } from "@/lib/billing/checkout";
import { BillingNotConfigured } from "@/lib/billing/stripe";
import { isCouchsurferMember } from "@/lib/billing/limits";

// Couchsurfer membership checkout (DOK-219). Yearly add-on that unlocks sending
// free couch hosting requests. Tagged kind="couchsurfer_membership" so the
// webhook records it on CouchsurferMembership, not the plan Subscription.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (await isCouchsurferMember(session.userId)) {
    return NextResponse.json({ error: "ALREADY_MEMBER" }, { status: 409 });
  }

  const priceId = process.env.STRIPE_PRICE_COUCHSURFER_YEARLY;
  if (!priceId) {
    return NextResponse.json({ error: "Couchsurfer membership not configured" }, { status: 503 });
  }

  try {
    const url = await startSubscriptionCheckout({
      userId: session.userId,
      priceId,
      kind: "couchsurfer_membership",
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
