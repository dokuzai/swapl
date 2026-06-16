// Explicit read receipt for a swap thread (DOK-154).
//
// POST marks every inbound (other-party) unread message in the thread as read
// for the caller. GET on /messages already marks read implicitly; this gives
// native clients a cheap, body-less way to clear the unread badge (e.g. when
// the thread becomes visible) without re-fetching the page.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAccessConversation } from "@/lib/conversation/participants";

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]/messages/read">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: { targetListing: { select: { userId: true } } },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Principals + active guest participants (DOK-187) may clear their unread badge.
  if (!(await canAccessConversation(proposal, id, session.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Advance only the CALLER's read cursor (DOK-195). `marked` reports how many
  // inbound messages this clears for the caller — computed against their prior
  // cursor before we move it, so the count stays meaningful and per-recipient.
  const prev = await prisma.conversationRead.findUnique({
    where: { proposalId_userId: { proposalId: id, userId: session.userId } },
    select: { lastReadAt: true },
  });
  const marked = await prisma.swapMessage.count({
    where: {
      proposalId: id,
      authorId: { not: session.userId },
      createdAt: { gt: prev?.lastReadAt ?? new Date(0) },
    },
  });
  const now = new Date();
  await prisma.conversationRead.upsert({
    where: { proposalId_userId: { proposalId: id, userId: session.userId } },
    create: { proposalId: id, userId: session.userId, lastReadAt: now },
    update: { lastReadAt: now },
  });

  return NextResponse.json({ ok: true, marked });
}
