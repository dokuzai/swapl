// /inspire — "Get Inspired" assistant flow (DOK-146, extended by DOK-148).
//
// Plain visit → the compose form (everything interactive lives in the client
// component, which talks to POST /api/assistant/inspire and friends).
//
// ?package={id}&step=pay → the deep link the iOS/Android apps open to save a
// card (Stripe Payment Element) for an existing DRAFT package: we load the
// caller's package server-side and the client jumps straight to the
// "Payment & reservation" step, ending on "Card saved — you can go back to
// the app". A missing / foreign / non-draft package shows a clear message
// instead of the empty compose form.
//
// The auth gate lives HERE (not in the layout) so the login redirect can
// carry the full query string — layouts never see searchParams, and the old
// `next=/inspire` dropped ?package & ?step, landing app users on the empty
// compose form after login.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { InspirePackage, InspirePayload } from "@/lib/ai/inspire";
import { InspireClient } from "./inspire-client";

export const metadata = { title: "Get Inspired · swapl" };

export default async function InspirePage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string; step?: string }>;
}) {
  const { package: packageId, step } = await searchParams;

  const session = await getSession();
  if (!session) {
    const qs = new URLSearchParams();
    if (packageId) qs.set("package", packageId);
    if (step) qs.set("step", step);
    const next = qs.size > 0 ? `/inspire?${qs.toString()}` : "/inspire";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!packageId) return <InspireClient />;

  const row = await prisma.inspirationPackage.findUnique({ where: { id: packageId } });
  if (!row || row.userId !== session.userId || row.status !== "draft") {
    return <InspireClient resumeInvalid />;
  }

  let payload: InspirePayload;
  try {
    payload = JSON.parse(row.payload) as InspirePayload;
  } catch {
    return <InspireClient resumeInvalid />;
  }

  const pkg: InspirePackage = { ...payload, packageId: row.id };
  return <InspireClient initialPackage={pkg} resumePayment={step === "pay"} />;
}
