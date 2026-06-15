// "Add co-travelers" quick-pick suggestions (DOK-187).
//
// A reasonable, privacy-conservative notion of "people I travel with": the
// counterparties of the caller's OTHER swaps (any proposal where the caller is
// proposer or target owner). These are accounts the caller has already
// transacted with, so surfacing them as one-tap invites is safe. Only a
// PRINCIPAL of this conversation may read suggestions, and anyone already in
// this conversation is filtered out.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isPrincipal } from "@/lib/conversation/participants";
import { forbidden, notFound, unauthenticated } from "@/lib/api/errors";

const MAX_SUGGESTIONS = 12;

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/proposals/[id]/participants/suggestions">
) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    select: { proposerId: true, targetListing: { select: { userId: true } } },
  });
  if (!proposal) return notFound();

  if (!isPrincipal(proposal, session.userId)) return forbidden("Only swap principals can invite.");

  // All proposals the caller is a party to (proposer OR target owner), other
  // than this one — gather the *other* side's userId from each.
  const myProposals = await prisma.swapProposal.findMany({
    where: {
      id: { not: id },
      OR: [{ proposerId: session.userId }, { targetListing: { userId: session.userId } }],
    },
    select: {
      proposerId: true,
      targetListing: { select: { userId: true } },
    },
  });

  const counterpartyIds = new Set<string>();
  for (const p of myProposals) {
    const other = p.proposerId === session.userId ? p.targetListing.userId : p.proposerId;
    if (other && other !== session.userId) counterpartyIds.add(other);
  }

  // Exclude this conversation's principals and anyone already a (non-removed)
  // participant here.
  counterpartyIds.delete(proposal.proposerId);
  counterpartyIds.delete(proposal.targetListing.userId);

  const alreadyHere = await prisma.conversationParticipant.findMany({
    where: { proposalId: id, status: { not: "removed" }, userId: { not: null } },
    select: { userId: true },
  });
  for (const row of alreadyHere) if (row.userId) counterpartyIds.delete(row.userId);

  const ids = [...counterpartyIds].slice(0, MAX_SUGGESTIONS);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, avatar: true },
      })
    : [];

  return NextResponse.json({
    suggestions: users.map((u) => ({ userId: u.id, name: u.name, avatar: u.avatar })),
  });
}
