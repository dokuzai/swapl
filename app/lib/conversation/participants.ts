// Multi-party swap conversation — server-side access control + participant
// helpers (DOK-187).
//
// The conversation is anchored to a SwapProposal. The TWO PRINCIPAL parties
// are implicit: the proposer and the target listing's owner. They are always
// allowed to read/post/act and can never be removed. Anyone else only gains
// access through an ACTIVE ConversationParticipant row (role
// "guest_participant"), which grants thread read+write but NEVER the power to
// act on the swap (accept/counter/decline/withdraw stay principal-only).
//
// Email-only invites land as `pending` rows; they materialise to `active`
// (with a resolved userId) the first time the invited address signs in or
// registers — see activateInvitedParticipants().

import { prisma } from "@/lib/db";
import { normaliseEmail } from "@/lib/auth/tokens";

export type ParticipantRole = "principal" | "guest_participant";
export type ParticipantStatus = "active" | "pending" | "removed";

// The minimal proposal shape the access helpers need. Callers include
// targetListing.userId; everything else is optional.
export type ProposalParties = {
  proposerId: string;
  targetListing: { userId: string };
};

export function isPrincipal(proposal: ProposalParties, userId: string): boolean {
  return proposal.proposerId === userId || proposal.targetListing.userId === userId;
}

// Does this user have ANY access to the conversation thread? True for the two
// principals OR for an active guest participant. Used to gate message
// read/write. Acting on the swap is a separate, stricter check (isPrincipal).
export async function canAccessConversation(
  proposal: ProposalParties,
  proposalId: string,
  userId: string
): Promise<boolean> {
  if (isPrincipal(proposal, userId)) return true;
  const guest = await prisma.conversationParticipant.findFirst({
    where: { proposalId, userId, status: "active" },
    select: { id: true },
  });
  return guest != null;
}

// On sign-in / registration: promote any pending email invites for this
// address to active, stamping the now-known userId. Idempotent and
// best-effort — callers wrap in try/catch so auth never fails on a hiccup.
//
// If an active row for the same (proposal, userId) already exists (e.g. the
// principal also added them by id), the email row is marked `removed` to keep
// the (proposalId, userId) uniqueness invariant intact.
export async function activateInvitedParticipants(
  userId: string,
  email: string
): Promise<void> {
  const normalised = normaliseEmail(email);
  const pending = await prisma.conversationParticipant.findMany({
    where: { invitedEmail: normalised, status: "pending", userId: null },
    select: { id: true, proposalId: true },
  });
  for (const row of pending) {
    // Don't let a guest invite shadow a principal: if the now-known user is
    // actually a principal of that proposal, drop the guest row instead.
    const proposal = await prisma.swapProposal.findUnique({
      where: { id: row.proposalId },
      select: { proposerId: true, targetListing: { select: { userId: true } } },
    });
    if (proposal && isPrincipal(proposal, userId)) {
      await prisma.conversationParticipant.update({
        where: { id: row.id },
        data: { status: "removed", userId },
      });
      continue;
    }
    const existingActive = await prisma.conversationParticipant.findUnique({
      where: { proposalId_userId: { proposalId: row.proposalId, userId } },
      select: { id: true },
    });
    if (existingActive) {
      await prisma.conversationParticipant.update({
        where: { id: row.id },
        data: { status: "removed" },
      });
      continue;
    }
    await prisma.conversationParticipant.update({
      where: { id: row.id },
      data: { userId, status: "active" },
    });
  }
}
