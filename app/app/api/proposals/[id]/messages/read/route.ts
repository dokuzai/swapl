// Explicit read receipt for a swap thread (DOK-154).
//
// POST marks every inbound (other-party) unread message in the thread as read
// for the caller. GET on /messages already marks read implicitly; this gives
// native clients a cheap, body-less way to clear the unread badge (e.g. when
// the thread becomes visible) without re-fetching the page.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]/messages/read">) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: { targetListing: { select: { userId: true } } },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParty =
    proposal.proposerId === session.userId || proposal.targetListing.userId === session.userId;
  if (!isParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { count } = await prisma.swapMessage.updateMany({
    where: { proposalId: id, authorId: { not: session.userId }, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: count });
}
