// Non-binding premium preview for a pending proposal. Lets the swap-accept UI
// show "covered up to €150,000 — €X premium" before the user commits, so the
// quote always matches what the bind path (proposal accept) will charge.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { insuranceProvider } from "@/lib/insurance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const proposalId = new URL(req.url).searchParams.get("proposalId");
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });

  const proposal = await prisma.swapProposal.findUnique({
    where: { id: proposalId },
    include: { proposerListing: true, targetListing: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (![proposal.proposerListing.userId, proposal.targetListing.userId].includes(session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const provider = insuranceProvider();
  const quote = provider.quote({
    parties: [
      { listing: { sizeSqm: proposal.proposerListing.sizeSqm } },
      { listing: { sizeSqm: proposal.targetListing.sizeSqm } },
    ],
    dateFrom: proposal.dateFrom,
    dateTo: proposal.dateTo,
  });

  return NextResponse.json({
    provider: provider.name,
    nights: quote.nights,
    coverageAmount: quote.coverageAmount,
    premiumCents: quote.premiumCents,
    premiumEur: quote.premiumCents / 100,
    platformShareCents: quote.platformShareCents,
  });
}
