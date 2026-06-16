import { prisma } from "@/lib/db";

// Serializable conversation summary shared by the inbox list pane on
// /swaps and /swaps/[id] (three-pane layout, DOK-150) and the mobile chat
// list (GET /api/conversations, DOK-154).
export type Conversation = {
  id: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  updatedAt: string;
  /** "hosting" = they proposed to my home; "traveling" = I proposed to theirs. */
  role: "hosting" | "traveling";
  myCity: string;
  myNeighbourhood: string;
  theirCity: string;
  theirNeighbourhood: string;
  otherName: string | null;
  /** Most recent message line for the list preview. */
  lastLine: string | null;
  /** ISO timestamp of the last chat message, or null if none yet. */
  lastMessageAt: string | null;
  /** Inbound messages the viewer hasn't read yet. */
  unreadCount: number;
};

export async function getConversations(userId: string): Promise<Conversation[]> {
  const proposals = await prisma.swapProposal.findMany({
    where: {
      OR: [{ proposerId: userId }, { targetListing: { userId } }],
    },
    include: {
      proposerListing: { select: { city: true, neighbourhood: true } },
      targetListing: {
        select: { city: true, neighbourhood: true, userId: true, user: { select: { name: true } } },
      },
      proposer: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, photos: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Unread counts, per-recipient (DOK-195): inbound (other-party) messages
  // created after THIS viewer's read cursor for each thread. One grouped query,
  // keyed off the viewer's own cursors — a co-participant's reads never affect
  // this count. Threads with no cursor yet count all inbound messages (epoch).
  const ids = proposals.map((p) => p.id);
  const unreadByProposal = new Map<string, number>();
  if (ids.length) {
    const cursors = await prisma.conversationRead.findMany({
      where: { userId, proposalId: { in: ids } },
      select: { proposalId: true, lastReadAt: true },
    });
    const cursorByProposal = new Map(cursors.map((c) => [c.proposalId, c.lastReadAt]));
    const grouped = await prisma.swapMessage.groupBy({
      by: ["proposalId"],
      where: {
        authorId: { not: userId },
        OR: ids.map((pid) => ({
          proposalId: pid,
          createdAt: { gt: cursorByProposal.get(pid) ?? new Date(0) },
        })),
      },
      _count: { _all: true },
    });
    for (const g of grouped) unreadByProposal.set(g.proposalId, g._count._all);
  }

  const previewLine = (
    msg: { body: string; photos: string } | undefined,
    fallback: string | null
  ): string | null => {
    if (!msg) return fallback;
    if (msg.body && msg.body.trim().length) return msg.body;
    // Photo-only message: show a placeholder instead of an empty preview.
    return "📷 Photo";
  };

  return proposals.map((p) => {
    const meIsProposer = p.proposerId === userId;
    const lastMsg = p.messages[0];
    return {
      id: p.id,
      status: p.status,
      dateFrom: p.dateFrom.toISOString(),
      dateTo: p.dateTo.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      role: meIsProposer ? "traveling" : "hosting",
      myCity: meIsProposer ? p.proposerListing.city : p.targetListing.city,
      myNeighbourhood: meIsProposer ? p.proposerListing.neighbourhood : p.targetListing.neighbourhood,
      theirCity: meIsProposer ? p.targetListing.city : p.proposerListing.city,
      theirNeighbourhood: meIsProposer ? p.targetListing.neighbourhood : p.proposerListing.neighbourhood,
      otherName: meIsProposer ? p.targetListing.user.name : p.proposer.name,
      lastLine: previewLine(lastMsg, p.counterMessage ?? p.message),
      lastMessageAt: lastMsg ? lastMsg.createdAt.toISOString() : null,
      unreadCount: unreadByProposal.get(p.id) ?? 0,
    };
  });
}

export function isArchived(status: string): boolean {
  return status === "DECLINED" || status === "WITHDRAWN";
}
