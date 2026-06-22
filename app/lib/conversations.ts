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

// The two PRINCIPALS (no guest participants) — these are who gate a ✓✓ read
// receipt. Swap: proposer + target owner. Stay: guest + host.
export async function conversationPrincipalIds(conversationId: string): Promise<string[]> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      keysStay: { select: { guestId: true, hostId: true } },
      proposal: { select: { proposerId: true, targetListing: { select: { userId: true } } } },
    },
  });
  if (!convo) return [];
  if (convo.keysStay) return [convo.keysStay.guestId, convo.keysStay.hostId];
  if (convo.proposal) return [convo.proposal.proposerId, convo.proposal.targetListing.userId];
  return [];
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
  readAt: string | null;
  createdAt: string;
};

// A message is "read" once every PRINCIPAL recipient (the counterpart(s) — not
// the author) has a read cursor at or past its createdAt. Returns the moment it
// became fully read, or null if at least one recipient hasn't caught up.
function computeReadAt(
  m: { authorId: string | null; createdAt: Date },
  principalIds: string[],
  cursorByUser: Map<string, Date>,
): Date | null {
  if (!m.authorId) return null; // system events have no receipt
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

function serializeMessage(m: {
  id: string;
  kind: string;
  authorId: string | null;
  body: string | null;
  photos: string;
  eventType: string | null;
  eventMeta: string | null;
  createdAt: Date;
}, viewerId: string, principalIds: string[], cursorByUser: Map<string, Date>): SerializedMessage {
  const readAt = computeReadAt(m, principalIds, cursorByUser);
  return {
    id: m.id,
    kind: m.kind,
    authorId: m.authorId,
    mine: m.authorId === viewerId,
    body: m.body,
    photos: parseJSON<string[]>(m.photos, []),
    eventType: m.eventType,
    eventMeta: m.eventMeta ? parseJSON<unknown>(m.eventMeta, null) : null,
    readAt: readAt ? readAt.toISOString() : null,
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
  // Principals' read cursors drive the per-message ✓✓ receipt (guests don't gate).
  const principalIds = await conversationPrincipalIds(conversationId);
  const cursors = await prisma.conversationReadCursor.findMany({
    where: { conversationId, userId: { in: principalIds } },
    select: { userId: true, lastReadAt: true },
  });
  const cursorByUser = new Map(cursors.map((c) => [c.userId, c.lastReadAt]));
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  return {
    messages: page.reverse().map((m) => serializeMessage(m, viewerId, principalIds, cursorByUser)),
    nextCursor: hasMore ? page[0]?.id ?? null : null,
    hasMore,
  };
}

// Short, human preview line for an event row (used in the Messages list).
function eventLabel(eventType: string | null): string {
  switch (eventType) {
    case "request_sent": return "Request sent";
    case "preapproved": return "Pre-approved";
    case "confirmed": return "Confirmed";
    case "accepted": return "Swap accepted";
    case "countered": return "New dates proposed";
    case "declined": return "Declined";
    case "withdrawn": return "Withdrawn";
    case "cancelled": return "Cancelled";
    case "change_requested": return "Change requested";
    case "change_accepted": return "Change accepted";
    case "checked_in": return "Checked in";
    case "checked_out": return "Checked out";
    case "completed": return "Completed";
    default: return "Update";
  }
}

export type ConversationListItem = {
  id: string;
  kind: "swap" | "stay";
  role: "traveling" | "hosting";
  status: string;
  title: string;
  city: string | null;
  photo: string | null;
  counterpartName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  lastLine: string | null;
  lastMessageAt: string;
  unreadCount: number;
  // Per-user archive timestamp (DOK-221); null when active.
  archivedAt: string | null;
  // Swap threads carry their proposalId so the chat can show the multi-party
  // People panel (DOK-187); null for stays. isPrincipal = the viewer is a swap
  // principal (proposer/target owner), always true for stays.
  proposalId: string | null;
  isPrincipal: boolean;
};

// Unified Messages list across both swap- and stay-backed threads, newest-first.
export async function listConversationsForUser(userId: string): Promise<ConversationListItem[]> {
  const convos = await prisma.conversation.findMany({
    where: {
      OR: [
        { keysStay: { OR: [{ guestId: userId }, { hostId: userId }] } },
        {
          proposal: {
            OR: [
              { proposerId: userId },
              { targetListing: { userId } },
              { participants: { some: { userId, status: "active" } } },
            ],
          },
        },
      ],
    },
    include: {
      reads: { where: { userId } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      keysStay: {
        include: {
          listing: { select: { title: true, city: true, photos: true } },
          guest: { select: { name: true } },
          host: { select: { name: true } },
        },
      },
      proposal: {
        include: {
          proposerListing: { select: { city: true, photos: true, user: { select: { name: true } } } },
          targetListing: { select: { city: true, photos: true, userId: true, user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items: ConversationListItem[] = [];
  for (const c of convos) {
    const last = c.messages[0] ?? null;
    const cursor = c.reads[0]?.lastReadAt ?? null;
    const archivedAt = c.reads[0]?.archivedAt?.toISOString() ?? null;
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: c.id,
        ...(cursor ? { createdAt: { gt: cursor } } : {}),
        NOT: { authorId: userId },
      },
    });
    const lastLine = last
      ? last.kind === "event"
        ? eventLabel(last.eventType)
        : last.body ?? "Photo"
      : null;
    const lastMessageAt = (last?.createdAt ?? c.updatedAt).toISOString();

    if (c.keysStay) {
      const s = c.keysStay;
      const isGuest = s.guestId === userId;
      items.push({
        id: c.id,
        kind: "stay",
        role: isGuest ? "traveling" : "hosting",
        status: s.status,
        title: isGuest ? `Stay in ${s.listing.city}` : `Guest at ${s.listing.title}`,
        city: s.listing.city,
        photo: parseJSON<string[]>(s.listing.photos, [])[0] ?? null,
        counterpartName: (isGuest ? s.host.name : s.guest.name) ?? null,
        dateFrom: s.dateFrom.toISOString(),
        dateTo: s.dateTo.toISOString(),
        lastLine,
        lastMessageAt,
        unreadCount,
        archivedAt,
        proposalId: null,
        isPrincipal: true,
      });
    } else if (c.proposal) {
      const p = c.proposal;
      const isProposer = p.proposerId === userId;
      const their = isProposer ? p.targetListing : p.proposerListing;
      items.push({
        id: c.id,
        kind: "swap",
        role: isProposer ? "traveling" : "hosting",
        status: p.status,
        title: `Home in ${their.city}`,
        city: their.city,
        photo: parseJSON<string[]>(their.photos, [])[0] ?? null,
        counterpartName: their.user?.name ?? null,
        dateFrom: p.dateFrom.toISOString(),
        dateTo: p.dateTo.toISOString(),
        lastLine,
        lastMessageAt,
        unreadCount,
        archivedAt,
        proposalId: p.id,
        isPrincipal: isProposer || p.targetListing.userId === userId,
      });
    }
  }
  // Newest activity first.
  items.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  return items;
}

export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationReadCursor.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId, lastReadAt: new Date() },
  });
}

// Per-user archive toggle (DOK-221) — hides/restores the thread in the viewer's
// Messages list without affecting the other participant.
export async function setConversationArchived(conversationId: string, userId: string, archived: boolean) {
  const archivedAt = archived ? new Date() : null;
  await prisma.conversationReadCursor.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { archivedAt },
    create: { conversationId, userId, archivedAt },
  });
}
