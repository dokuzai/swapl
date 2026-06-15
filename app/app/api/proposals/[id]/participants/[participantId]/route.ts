// Remove a guest participant from a swap conversation (DOK-187).
//
// Only a PRINCIPAL may remove, and only guest seats can be removed — the two
// principals are structural and can never be evicted. Removal is a soft
// status flip (active|pending → removed) so the (proposalId,userId) /
// (proposalId,invitedEmail) uniqueness stays intact and re-inviting works.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isPrincipal } from "@/lib/conversation/participants";
import { forbidden, notFound, unauthenticated } from "@/lib/api/errors";

export async function DELETE(
  req: Request,
  { params }: RouteContext<"/api/proposals/[id]/participants/[participantId]">
) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id, participantId } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    select: { proposerId: true, targetListing: { select: { userId: true } } },
  });
  if (!proposal) return notFound();

  // Only principals can remove people from the conversation.
  if (!isPrincipal(proposal, session.userId)) return forbidden("Only swap principals can remove.");

  const participant = await prisma.conversationParticipant.findUnique({
    where: { id: participantId },
  });
  if (!participant || participant.proposalId !== id) return notFound("Participant not found");

  // Principals are never removable. (Guest rows are always role
  // "guest_participant"; this guard is belt-and-suspenders.)
  if (participant.role === "principal") {
    return forbidden("Cannot remove a swap principal.");
  }

  // Idempotent: removing an already-removed seat is a no-op success.
  if (participant.status !== "removed") {
    await prisma.conversationParticipant.update({
      where: { id: participantId },
      data: { status: "removed" },
    });
  }

  return NextResponse.json({ ok: true });
}
