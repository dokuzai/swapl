// GET /api/conversations — chat list with unread counts, last message preview,
// and most-recent-activity ordering. Prisma is mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-me", email: "me@swapl.test", name: "Me" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findManyProposals: vi.fn(),
  groupByMessages: vi.fn(),
  crFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapProposal: { findMany: mocks.findManyProposals },
    swapMessage: { groupBy: mocks.groupByMessages },
    conversationRead: { findMany: mocks.crFindMany },
  },
}));

import { GET } from "@/app/api/conversations/route";

function get() {
  return GET(new Request("https://swapl.test/api/conversations"));
}

const proposalRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  proposerId: "u-me",
  status: "ACCEPTED",
  dateFrom: new Date("2026-07-01"),
  dateTo: new Date("2026-07-10"),
  updatedAt: new Date("2026-06-01"),
  message: "original",
  counterMessage: null,
  proposerListing: { city: "Lisbon", neighbourhood: "Alfama" },
  targetListing: { city: "Porto", neighbourhood: "Ribeira", userId: "u-them", user: { name: "Them" } },
  proposer: { id: "u-me", name: "Me" },
  messages: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.groupByMessages.mockResolvedValue([]);
  mocks.crFindMany.mockResolvedValue([]);
});

describe("GET /api/conversations", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("returns conversations with counterpart, last line, and unread count", async () => {
    mocks.findManyProposals.mockResolvedValue([
      proposalRow({
        messages: [{ body: "see you soon", photos: "[]", createdAt: new Date("2026-06-05T10:00:00Z") }],
      }),
    ]);
    mocks.groupByMessages.mockResolvedValue([{ proposalId: "p1", _count: { _all: 2 } }]);

    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations).toHaveLength(1);
    expect(json.conversations[0]).toMatchObject({
      id: "p1",
      role: "traveling",
      otherName: "Them",
      lastLine: "see you soon",
      lastMessageAt: "2026-06-05T10:00:00.000Z",
      unreadCount: 2,
    });
    expect(json.totalUnread).toBe(2);
  });

  it("shows a photo placeholder for an attachment-only last message", async () => {
    mocks.findManyProposals.mockResolvedValue([
      proposalRow({
        messages: [{ body: "", photos: '["https://cdn.test/a.jpg"]', createdAt: new Date("2026-06-05") }],
      }),
    ]);
    const json = await (await get()).json();
    expect(json.conversations[0].lastLine).toBe("📷 Photo");
  });

  it("falls back to the proposal message when there are no chat messages", async () => {
    mocks.findManyProposals.mockResolvedValue([proposalRow({ messages: [] })]);
    const json = await (await get()).json();
    expect(json.conversations[0].lastLine).toBe("original");
    expect(json.conversations[0].lastMessageAt).toBeNull();
    expect(json.conversations[0].unreadCount).toBe(0);
  });

  it("counts unread per-recipient: against THIS viewer's read cursor (DOK-195)", async () => {
    mocks.findManyProposals.mockResolvedValue([proposalRow({ id: "p1", messages: [] })]);
    mocks.crFindMany.mockResolvedValue([
      { proposalId: "p1", lastReadAt: new Date("2026-06-04T00:00:00Z") },
    ]);
    await get();
    // The unread query is keyed off the viewer's own cursor per proposal, so a
    // co-participant reading the thread can never zero out this viewer's badge.
    expect(mocks.crFindMany).toHaveBeenCalledWith({
      where: { userId: "u-me", proposalId: { in: ["p1"] } },
      select: { proposalId: true, lastReadAt: true },
    });
    expect(mocks.groupByMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["proposalId"],
        where: expect.objectContaining({
          authorId: { not: "u-me" },
          OR: [{ proposalId: "p1", createdAt: { gt: new Date("2026-06-04T00:00:00Z") } }],
        }),
      })
    );
  });

  it("sorts most recent activity first (last message beats stale proposal)", async () => {
    mocks.findManyProposals.mockResolvedValue([
      proposalRow({ id: "stale", updatedAt: new Date("2026-06-09"), messages: [] }),
      proposalRow({
        id: "fresh",
        updatedAt: new Date("2026-06-01"),
        messages: [{ body: "newest", photos: "[]", createdAt: new Date("2026-06-10") }],
      }),
    ]);
    const json = await (await get()).json();
    expect(json.conversations.map((c: { id: string }) => c.id)).toEqual(["fresh", "stale"]);
  });
});
