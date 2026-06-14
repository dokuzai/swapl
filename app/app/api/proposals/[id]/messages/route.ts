// Swap thread messages — first-class chat (DOK-154).
//
// The thread is the continuous history of the COUPLE OF PARTIES bound to a
// proposal: messages exchanged during negotiation stay and keep flowing after
// the proposal is accepted into an agreement. Only the two parties (proposer
// and the target listing's owner) may read or post.
//
// GET supports cursor pagination (newest-first page window) and, by default,
// implicitly marks the caller's unread inbound messages as read. POST accepts
// optional image attachments (URLs already uploaded via
// /api/uploads/listing-photo), fires a push every time, and sends a
// notification email at most once per throttle window per recipient.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, parseJSON, stringifyJSON } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { accountSuspended } from "@/lib/api/errors";

// Send at most one notification email per recipient per thread per window.
const EMAIL_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const messageSchema = z.object({
  body: z.string().trim().max(4000),
  photos: z.array(z.string().url()).max(10).optional(),
}).refine((d) => d.body.length > 0 || (d.photos?.length ?? 0) > 0, {
  message: "Message must have text or at least one photo",
  path: ["body"],
});

type Party = { isProposer: boolean; isTarget: boolean };

function partyOf(
  proposal: { proposerId: string; targetListing: { userId: string } },
  userId: string
): Party {
  return {
    isProposer: proposal.proposerId === userId,
    isTarget: proposal.targetListing.userId === userId,
  };
}

function serialize(
  m: { id: string; proposalId: string; authorId: string; body: string; photos: string; readAt: Date | null; createdAt: Date },
  userId: string
) {
  return {
    id: m.id,
    proposalId: m.proposalId,
    authorId: m.authorId,
    mine: m.authorId === userId,
    body: m.body,
    photos: parseJSON<string[]>(m.photos, []),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
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

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const cursor = url.searchParams.get("cursor"); // message id; fetch older than this
  const markRead = url.searchParams.get("markRead") !== "false"; // default: read on GET

  // Page backwards (newest-first) so the client can lazily load history, then
  // present oldest-first within the page for natural rendering. We over-fetch
  // by one to compute nextCursor without a count query.
  const page = await prisma.swapMessage.findMany({
    where: { proposalId: id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = page.length > limit;
  const window = hasMore ? page.slice(0, limit) : page;
  const nextCursor = hasMore ? window[window.length - 1].id : null;

  // Implicit read receipt: mark the caller's inbound (other-party) unread
  // messages as read. Cheap and idempotent; scoped to the whole thread so a
  // catch-up read clears the badge regardless of which page was fetched.
  if (markRead) {
    await prisma.swapMessage.updateMany({
      where: { proposalId: id, authorId: { not: session.userId }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const ordered = window.slice().reverse(); // oldest-first for display
  return NextResponse.json({
    messages: ordered.map((m) => serialize(m, session.userId)),
    nextCursor,
    hasMore,
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
      proposerListing: { include: { user: { select: { id: true, email: true, suspendedAt: true } } } },
      targetListing: { include: { user: { select: { id: true, email: true, suspendedAt: true } } } },
    },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { isProposer, isTarget } = partyOf(proposal, session.userId);
  if (!isProposer && !isTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Moderation: no messaging while either party is suspended (caller or
  // counterparty) — read access via GET stays untouched.
  if (proposal.proposerListing.user.suspendedAt || proposal.targetListing.user.suspendedAt) {
    return accountSuspended();
  }

  const message = await prisma.swapMessage.create({
    data: {
      proposalId: id,
      authorId: session.userId,
      body: parsed.data.body,
      photos: stringifyJSON(parsed.data.photos ?? []),
    },
  });

  // Notify the other party. Push fires every message; email is throttled per
  // recipient per thread so an active back-and-forth doesn't flood the inbox.
  const other = isProposer ? proposal.targetListing.user : proposal.proposerListing.user;
  const fromName = session.name ?? session.email;

  sendPush(other.id, pushTemplates.swapMessageReceived(proposal.id, fromName)).catch((err) =>
    console.error("[swap-message:push]", err)
  );

  if (other.email) {
    maybeSendEmail(proposal.id, other.id, other.email, fromName).catch((err) =>
      console.error("[swap-message:email]", err)
    );
  }

  return NextResponse.json(
    { message: serialize(message, session.userId) },
    { status: 201 }
  );
}

// Best-effort throttled email. We upsert a per (thread, recipient) marker and
// only actually send when the last email is older than the throttle window.
// The check + write are serialized through the throttle row's primary key.
async function maybeSendEmail(
  proposalId: string,
  recipientId: string,
  recipientEmail: string,
  fromName: string
): Promise<void> {
  const now = Date.now();
  const existing = await prisma.swapMessageEmailThrottle.findUnique({
    where: { proposalId_recipientId: { proposalId, recipientId } },
  });
  if (existing && now - existing.lastEmailedAt.getTime() < EMAIL_THROTTLE_MS) {
    return; // within the quiet window — push already nudged them
  }
  await prisma.swapMessageEmailThrottle.upsert({
    where: { proposalId_recipientId: { proposalId, recipientId } },
    create: { proposalId, recipientId, lastEmailedAt: new Date(now) },
    update: { lastEmailedAt: new Date(now) },
  });
  await sendEmail(emailTemplates.swapMessageReceived(recipientEmail, fromName));
}
