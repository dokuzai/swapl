// Swap thread messages — first-class chat (DOK-154, multi-party DOK-187).
//
// The thread is the continuous history of the conversation bound to a
// proposal: messages exchanged during negotiation stay and keep flowing after
// the proposal is accepted into an agreement. The two PRINCIPAL parties
// (proposer and the target listing's owner) plus any ACTIVE guest participant
// (DOK-187) may read or post. Guests can chat but can never act on the swap.
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
import { canAccessConversation } from "@/lib/conversation/participants";

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

// Per-recipient read receipt (DOK-195). A message is "read" once every PRINCIPAL
// recipient (the swap counterpart(s) — guests are non-acting observers and don't
// gate the sender's ✓✓) has a read cursor at or past its createdAt. Returns the
// moment it became fully read, or null if at least one recipient hasn't caught up.
function computeReadAt(
  m: { authorId: string; createdAt: Date },
  principalIds: string[],
  cursorByUser: Map<string, Date>
): Date | null {
  const recipients = principalIds.filter((id) => id && id !== m.authorId);
  if (recipients.length === 0) return null;
  let readAt: Date | null = null;
  for (const r of recipients) {
    const c = cursorByUser.get(r);
    if (!c || c < m.createdAt) return null; // someone hasn't read it yet
    if (!readAt || c > readAt) readAt = c;
  }
  return readAt;
}

function serialize(
  m: { id: string; proposalId: string; authorId: string; body: string; photos: string; createdAt: Date },
  userId: string,
  principalIds: string[],
  cursorByUser: Map<string, Date>
) {
  const readAt = computeReadAt(m, principalIds, cursorByUser);
  return {
    id: m.id,
    proposalId: m.proposalId,
    authorId: m.authorId,
    mine: m.authorId === userId,
    body: m.body,
    photos: parseJSON<string[]>(m.photos, []),
    readAt: readAt ? readAt.toISOString() : null,
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

  // Principals + active guest participants (DOK-187) may read the thread.
  if (!(await canAccessConversation(proposal, id, session.userId))) {
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

  // Implicit read receipt: advance the CALLER's own read cursor (DOK-195).
  // Per-recipient now — this only clears the caller's unread state and never
  // touches another participant's. Idempotent; scoped to the whole thread so a
  // catch-up read clears the badge regardless of which page was fetched.
  if (markRead) {
    const now = new Date();
    await prisma.conversationRead.upsert({
      where: { proposalId_userId: { proposalId: id, userId: session.userId } },
      create: { proposalId: id, userId: session.userId, lastReadAt: now },
      update: { lastReadAt: now },
    });
  }

  // Read cursors of the two principals drive the per-message ✓✓ receipt.
  const principalIds = [proposal.proposerId, proposal.targetListing.userId];
  const cursors = await prisma.conversationRead.findMany({
    where: { proposalId: id, userId: { in: principalIds } },
    select: { userId: true, lastReadAt: true },
  });
  const cursorByUser = new Map(cursors.map((c) => [c.userId, c.lastReadAt]));

  const ordered = window.slice().reverse(); // oldest-first for display
  return NextResponse.json({
    messages: ordered.map((m) => serialize(m, session.userId, principalIds, cursorByUser)),
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
  const principal = isProposer || isTarget;
  // Principals always have access; otherwise the caller must be an active guest
  // participant (DOK-187). Guests can chat but never act on the swap.
  if (!principal && !(await canAccessConversation(proposal, id, session.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Moderation: no messaging while either principal is suspended (covers both a
  // suspended caller-principal and a suspended counterparty). Guests are gated
  // on the principals' standing too — a suspended swap freezes the whole thread.
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

  // Notify every OTHER member of the conversation: both principals plus active
  // guest participants, minus the author. Push fires every message; email is
  // throttled per recipient per thread so a back-and-forth doesn't flood inboxes.
  const fromName = session.name ?? session.email;

  const guests = await prisma.conversationParticipant.findMany({
    where: { proposalId: id, status: "active", userId: { not: null } },
    select: { userId: true },
  });
  const guestIds = guests.map((g) => g.userId).filter((u): u is string => Boolean(u));

  const recipientIds = new Set<string>([
    proposal.proposerListing.user.id,
    proposal.targetListing.user.id,
    ...guestIds,
  ]);
  recipientIds.delete(session.userId);

  const emailByUserId = new Map<string, string | null>([
    [proposal.proposerListing.user.id, proposal.proposerListing.user.email],
    [proposal.targetListing.user.id, proposal.targetListing.user.email],
  ]);
  // Resolve guest emails (principals' emails already loaded above).
  const guestNeedingEmail = [...recipientIds].filter((uid) => !emailByUserId.has(uid));
  if (guestNeedingEmail.length) {
    const guestUsers = await prisma.user.findMany({
      where: { id: { in: guestNeedingEmail } },
      select: { id: true, email: true },
    });
    for (const u of guestUsers) emailByUserId.set(u.id, u.email);
  }

  for (const uid of recipientIds) {
    sendPush(uid, pushTemplates.swapMessageReceived(proposal.id, fromName)).catch((err) =>
      console.error("[swap-message:push]", err)
    );
    const email = emailByUserId.get(uid);
    if (email) {
      maybeSendEmail(proposal.id, uid, email, fromName).catch((err) =>
        console.error("[swap-message:email]", err)
      );
    }
  }

  // A just-sent message has no recipient reads yet → readAt is null. Pass the
  // principals + an empty cursor map so the serialized shape stays consistent.
  const principalIds = [proposal.proposerId, proposal.targetListing.user.id];
  return NextResponse.json(
    { message: serialize(message, session.userId, principalIds, new Map()) },
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
