// Multi-party swap conversation — participant roster (DOK-187).
//
// GET   list participants (principals + guests) for the "People" panel.
// POST  invite a co-traveler — only a PRINCIPAL (proposer or target owner) may
//       invite. By userId → added immediately as active. By email → a pending
//       row + invite email; the seat activates when that address signs in.
//
// Guests can READ this roster (so the panel renders) but cannot mutate it.
// Inviting/removing is principal-only and enforced server-side.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isPrincipal, canAccessConversation } from "@/lib/conversation/participants";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

const inviteSchema = z
  .object({
    byUserId: z.string().min(1).optional(),
    byEmail: z.string().email().optional(),
  })
  .refine((d) => Boolean(d.byUserId) !== Boolean(d.byEmail), {
    message: "Provide exactly one of byUserId or byEmail",
  });

type PrincipalUser = { id: string; name: string | null; avatar: string | null };

// Mask a pending-invite email for non-principal viewers: keep the first char and
// domain so the UI can render a recognizable placeholder without leaking the PII
// (e.g. "j•••@example.com"). Returns null unchanged.
function maskEmail(email: string | null): string | null {
  if (!email) return email;
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}•••@${domain}`;
}

function principalDTO(user: PrincipalUser) {
  return {
    id: `principal:${user.id}`,
    userId: user.id,
    invitedEmail: null as string | null,
    name: user.name,
    avatar: user.avatar,
    role: "principal" as const,
    status: "active" as const,
  };
}

async function loadProposal(id: string) {
  return prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposer: { select: { id: true, name: true, avatar: true } },
      targetListing: {
        select: { userId: true, user: { select: { id: true, name: true, avatar: true } } },
      },
    },
  });
}

export async function GET(req: Request, { params }: RouteContext<"/api/proposals/[id]/participants">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const proposal = await loadProposal(id);
  if (!proposal) return notFound();

  // Roster is visible to anyone with thread access (both principals + active guests).
  if (!(await canAccessConversation(proposal, id, session.userId))) return forbidden();

  const guests = await prisma.conversationParticipant.findMany({
    where: { proposalId: id, status: { not: "removed" } },
    orderBy: { createdAt: "asc" },
  });

  // Resolve display info for guests that have a known account.
  const userIds = guests.map((g) => g.userId).filter((u): u is string => Boolean(u));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const principals = [
    principalDTO(proposal.proposer),
    principalDTO(proposal.targetListing.user),
  ];

  // A pending invite's raw email is off-platform PII the invitee never agreed to
  // share with co-travellers. Only the principals (the inviters) see the address;
  // other viewers get a masked form so the UI can still show a pending seat.
  const viewerIsPrincipal = isPrincipal(proposal, session.userId);

  const guestDTOs = guests.map((g) => {
    const u = g.userId ? userById.get(g.userId) : null;
    return {
      id: g.id,
      userId: g.userId,
      invitedEmail: viewerIsPrincipal ? g.invitedEmail : maskEmail(g.invitedEmail),
      name: u?.name ?? null,
      avatar: u?.avatar ?? null,
      role: "guest_participant" as const,
      status: g.status,
    };
  });

  return NextResponse.json({ participants: [...principals, ...guestDTOs] });
}

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]/participants">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Provide exactly one of byUserId or byEmail");

  const proposal = await loadProposal(id);
  if (!proposal) return notFound();

  // Only the two PRINCIPAL parties may invite.
  if (!isPrincipal(proposal, session.userId)) return forbidden("Only swap principals can invite.");

  const fromName = session.name ?? session.email;

  // ---- Invite by userId: immediate active seat ----
  if (parsed.data.byUserId) {
    const targetUserId = parsed.data.byUserId;

    // A principal is already in the conversation — inviting them is a no-op.
    if (isPrincipal(proposal, targetUserId)) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, avatar: true, email: true },
    });
    if (!user) return notFound("User not found");

    // Idempotent: upsert on (proposalId, userId). Re-activates a removed seat.
    const participant = await prisma.conversationParticipant.upsert({
      where: { proposalId_userId: { proposalId: id, userId: targetUserId } },
      create: {
        proposalId: id,
        userId: targetUserId,
        role: "guest_participant",
        status: "active",
        invitedById: session.userId,
      },
      update: { status: "active", invitedById: session.userId },
    });

    sendPush(targetUserId, pushTemplates.swapParticipantInvited(id, fromName)).catch((err) =>
      console.error("[participant:push]", err)
    );
    if (user.email) {
      sendEmail(emailTemplates.swapParticipantInvited(user.email, fromName), {
        kind: "swapParticipantInvited",
      }).catch((err) =>
        console.error("[participant:email]", err)
      );
    }

    return NextResponse.json(
      {
        participant: {
          id: participant.id,
          userId: participant.userId,
          invitedEmail: participant.invitedEmail,
          role: participant.role,
          status: participant.status,
          name: user.name,
          avatar: user.avatar,
        },
      },
      { status: 201 }
    );
  }

  // ---- Invite by email: pending seat + invite email ----
  const email = normaliseEmail(parsed.data.byEmail!);

  // If the email already maps to an account, treat it as a userId invite so the
  // seat is active immediately (and a principal can't be re-invited).
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, avatar: true, email: true },
  });
  if (existingUser) {
    if (isPrincipal(proposal, existingUser.id)) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }
    const participant = await prisma.conversationParticipant.upsert({
      where: { proposalId_userId: { proposalId: id, userId: existingUser.id } },
      create: {
        proposalId: id,
        userId: existingUser.id,
        role: "guest_participant",
        status: "active",
        invitedById: session.userId,
      },
      update: { status: "active", invitedById: session.userId },
    });
    sendPush(existingUser.id, pushTemplates.swapParticipantInvited(id, fromName)).catch((err) =>
      console.error("[participant:push]", err)
    );
    if (existingUser.email) {
      sendEmail(emailTemplates.swapParticipantInvited(existingUser.email, fromName), {
        kind: "swapParticipantInvited",
      }).catch((err) =>
        console.error("[participant:email]", err)
      );
    }
    return NextResponse.json(
      {
        participant: {
          id: participant.id,
          userId: participant.userId,
          invitedEmail: participant.invitedEmail,
          role: participant.role,
          status: participant.status,
          name: existingUser.name,
          avatar: existingUser.avatar,
        },
      },
      { status: 201 }
    );
  }

  // Unknown email → pending seat, idempotent on (proposalId, invitedEmail).
  const participant = await prisma.conversationParticipant.upsert({
    where: { proposalId_invitedEmail: { proposalId: id, invitedEmail: email } },
    create: {
      proposalId: id,
      invitedEmail: email,
      role: "guest_participant",
      status: "pending",
      invitedById: session.userId,
    },
    update: { status: "pending", invitedById: session.userId },
  });

  sendEmail(emailTemplates.swapParticipantInvited(email, fromName), {
    kind: "swapParticipantInvited",
  }).catch((err) =>
    console.error("[participant:email]", err)
  );

  return NextResponse.json(
    {
      participant: {
        id: participant.id,
        userId: participant.userId,
        invitedEmail: participant.invitedEmail,
        role: participant.role,
        status: participant.status,
        name: null,
        avatar: null,
      },
    },
    { status: 201 }
  );
}
