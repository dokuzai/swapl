// Unified per-transaction conversations (DOK-221).
//
// One Conversation hangs off exactly one transaction — a SwapProposal OR a
// KeysStay — so re-booking the same home later (a new KeysStay) starts a fresh
// thread. A conversation's timeline mixes member `text` messages with system
// `event` rows (request sent, confirmed, change requested, checked in, …), so
// the chat IS the activity log.

import { prisma, parseJSON, stringifyJSON } from "@/lib/db";

export type ConversationEventType =
  | "request_sent"
  | "preapproved"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "withdrawn"
  | "countered"
  | "accepted"
  | "change_requested"
  | "change_accepted"
  | "checked_in"
  | "checked_out"
  | "completed";

// Lazily get (or create) the thread for a transaction. Idempotent: the unique
// proposalId/keysStayId makes a second create collapse to the existing row.
export async function conversationForKeysStay(keysStayId: string) {
  return prisma.conversation.upsert({
    where: { keysStayId },
    update: {},
    create: { keysStayId },
  });
}

export async function conversationForProposal(proposalId: string) {
  return prisma.conversation.upsert({
    where: { proposalId },
    update: {},
    create: { proposalId },
  });
}

// Append a system event and bump the thread's updatedAt (so it sorts to the top
// of the Messages list). Best-effort callers should .catch() — a failed event
// must never roll back the underlying transaction it describes.
export async function recordEvent(
  conversationId: string,
  eventType: ConversationEventType,
  meta?: Record<string, unknown>,
) {
  await prisma.message.create({
    data: {
      conversationId,
      kind: "event",
      eventType,
      eventMeta: meta ? stringifyJSON(meta) : null,
    },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

export async function recordStayEvent(
  keysStayId: string,
  eventType: ConversationEventType,
  meta?: Record<string, unknown>,
) {
  const convo = await conversationForKeysStay(keysStayId);
  await recordEvent(convo.id, eventType, meta);
}

export async function recordProposalEvent(
  proposalId: string,
  eventType: ConversationEventType,
  meta?: Record<string, unknown>,
) {
  const convo = await conversationForProposal(proposalId);
  await recordEvent(convo.id, eventType, meta);
}

// The members of a conversation (user ids) — used for access control + notifies.
// Swap: both principals + active guest participants. Stay: guest + host.
export async function conversationParticipantIds(conversationId: string): Promise<string[]> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      keysStay: { select: { guestId: true, hostId: true } },
      proposal: {
        select: {
          proposerId: true,
          targetListing: { select: { userId: true } },
          participants: { where: { status: "active" }, select: { userId: true } },
        },
      },
    },
  });
  if (!convo) return [];
  if (convo.keysStay) return [convo.keysStay.guestId, convo.keysStay.hostId];
  if (convo.proposal) {
    const ids = new Set<string>([convo.proposal.proposerId, convo.proposal.targetListing.userId]);
    for (const p of convo.proposal.participants) if (p.userId) ids.add(p.userId);
    return [...ids];
  }
  return [];
}

export async function canAccessConversation(conversationId: string, userId: string): Promise<boolean> {
  return (await conversationParticipantIds(conversationId)).includes(userId);
}

// Post a member's text message (with optional pre-uploaded photo URLs).
export async function postMessage(
  conversationId: string,
  authorId: string,
  body: string | null,
  photos: string[],
) {
  const msg = await prisma.message.create({
    data: {
      conversationId,
      authorId,
      kind: "text",
      body: body && body.trim().length ? body : null,
      photos: stringifyJSON(photos),
    },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return msg;
}

type SerializedMessage = {
  id: string;
  kind: string;
  authorId: string | null;
  mine: boolean;
  body: string | null;
  photos: string[];
  eventType: string | null;
  eventMeta: unknown | null;
  createdAt: string;
};

function serializeMessage(m: {
  id: string;
  kind: string;
  authorId: string | null;
  body: string | null;
  photos: string;
  eventType: string | null;
  eventMeta: string | null;
  createdAt: Date;
}, viewerId: string): SerializedMessage {
  return {
    id: m.id,
    kind: m.kind,
    authorId: m.authorId,
    mine: m.authorId === viewerId,
    body: m.body,
    photos: parseJSON<string[]>(m.photos, []),
    eventType: m.eventType,
    eventMeta: m.eventMeta ? parseJSON<unknown>(m.eventMeta, null) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

// One page of timeline (oldest→newest for display), newest-first under the hood.
export async function getMessages(
  conversationId: string,
  viewerId: string,
  opts: { limit: number; cursor?: string | null },
) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  return {
    messages: page.reverse().map((m) => serializeMessage(m, viewerId)),
    nextCursor: hasMore ? page[0]?.id ?? null : null,
    hasMore,
  };
}

export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationReadCursor.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId, lastReadAt: new Date() },
  });
}
