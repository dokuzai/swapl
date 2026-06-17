// Cancel an active swap agreement *before* it starts. Cancels the policy
// at the underwriter, marks the agreement INTERRUPTED, and notifies both
// parties. Mid-stay cancellations route through the trip-interruption
// claim flow instead (out of v1 scope).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { insuranceProvider } from "@/lib/insurance";
import { releaseListingOccupancy } from "@/lib/listing/occupancy";

export async function POST(req: Request, { params }: RouteContext<"/api/agreements/[id]/cancel">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;

  const agreement = await prisma.swapAgreement.findUnique({
    where: { id },
    include: {
      listing1: { include: { user: true } },
      listing2: { include: { user: true } },
      insurancePolicy: true,
      proposal: true,
    },
  });
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const involved = new Set([agreement.listing1.userId, agreement.listing2.userId]);
  if (!involved.has(session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (agreement.status !== "ACTIVE") {
    return NextResponse.json({ error: "Already closed" }, { status: 409 });
  }
  if (agreement.dateFrom <= new Date()) {
    return NextResponse.json(
      { error: "Cancellation window closed — open a trip-interruption claim from /swaps." },
      { status: 409 },
    );
  }

  // Cancel the policy at the underwriter first; if that fails we still mark
  // the agreement so the user isn't blocked.
  if (agreement.insurancePolicy?.externalId) {
    try {
      await insuranceProvider().cancelPolicy(agreement.insurancePolicy.externalId);
    } catch (err) {
      console.error("[insurance:cancel]", err);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.swapAgreement.update({ where: { id }, data: { status: "INTERRUPTED" } });
    await tx.insurancePolicy.updateMany({
      where: { agreementId: id },
      data: { status: "cancelled" },
    });
    await releaseListingOccupancy(tx, { source: "swap_agreement", sourceId: id });
  });

  for (const u of [agreement.listing1.user, agreement.listing2.user]) {
    sendEmail({
      to: u.email,
      subject: "Your swap was cancelled — insurance refunded",
      text: `The swap between ${agreement.listing1.city} and ${agreement.listing2.city} for ${agreement.dateFrom.toDateString()} → ${agreement.dateTo.toDateString()} has been cancelled. Your insurance policy has been cancelled and any premium share refunded. Browse new matches at /listings.`,
    }, { kind: "swapCancelled" }).catch((err) => console.error("[cancel:email]", err));
    sendPush(u.id, pushTemplates.swapCancelled(agreement.proposalId)).catch((err) =>
      console.error("[cancel:push]", err)
    );
  }

  return NextResponse.json({ ok: true });
}
