// Swap thread messages. Only the two parties of a proposal (proposer and
// the target listing's owner) may read or post. Posting notifies the other
// side via email + push, mirroring the proposal lifecycle routes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";

const messageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
});

type Party = {
  isProposer: boolean;
  isTarget: boolean;
};

function partyOf(
  proposal: { proposerId: string; targetListing: { userId: string } },
  userId: string
): Party {
  return {
    isProposer: proposal.proposerId === userId,
    isTarget: proposal.targetListing.userId === userId,
  };
}

export async function GET(req: Request, { params }: RouteContext<"/api/proposals/[id]/messages">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: { targetListing: { select: { userId: true } } },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { isProposer, isTarget } = partyOf(proposal, session.userId);
  if (!isProposer && !isTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await prisma.swapMessage.findMany({
    where: { proposalId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      proposalId: m.proposalId,
      authorId: m.authorId,
      mine: m.authorId === session.userId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]/messages">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  // Anti-burst safety net — same in-memory limiter the proposal routes use.
  const rl = checkRateLimit(`swap-messages:${session.userId}`, 30, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many messages. Slow down a little." }, { status: 429 });
  }

  const { id } = await params;
  const parsed = messageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposerListing: { include: { user: { select: { id: true, email: true } } } },
      targetListing: { include: { user: { select: { id: true, email: true } } } },
    },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { isProposer, isTarget } = partyOf(proposal, session.userId);
  if (!isProposer && !isTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const message = await prisma.swapMessage.create({
    data: { proposalId: id, authorId: session.userId, body: parsed.data.body },
  });

  // Notify the other party via email + push (fire-and-forget).
  const other = isProposer ? proposal.targetListing.user : proposal.proposerListing.user;
  const fromName = session.name ?? session.email;
  if (other.email) {
    sendEmail(emailTemplates.swapMessageReceived(other.email, fromName)).catch((err) =>
      console.error("[swap-message:email]", err)
    );
  }
  sendPush(other.id, pushTemplates.swapMessageReceived(proposal.id, fromName)).catch((err) =>
    console.error("[swap-message:push]", err)
  );

  return NextResponse.json(
    {
      message: {
        id: message.id,
        proposalId: message.proposalId,
        authorId: message.authorId,
        mine: true,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
