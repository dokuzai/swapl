import { prisma } from "@/lib/db";

// Serializable conversation summary shared by the inbox list pane on
// /swaps and /swaps/[id] (three-pane layout, DOK-150).
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
    },
    orderBy: { updatedAt: "desc" },
  });

  return proposals.map((p) => {
    const meIsProposer = p.proposerId === userId;
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
      lastLine: p.counterMessage ?? p.message,
    };
  });
}

export function isArchived(status: string): boolean {
  return status === "DECLINED" || status === "WITHDRAWN";
}
