// POST/GET /api/proposals/[id]/messages — party-only authorization, body
// validation, creation, and fan-out to the other side. Prisma + adapters are
// mocked so the route logic runs hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-proposer", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findUniqueProposal: vi.fn(),
  createMessage: vi.fn(),
  findManyMessages: vi.fn(),
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  swapMessageReceivedEmail: vi.fn((to: string) => ({ to, subject: "msg", text: "msg" })),
  swapMessageReceivedPush: vi.fn((proposalId: string) => ({
    title: "msg",
    body: "msg",
    data: { kind: "swapMessageReceived", proposalId, deepLink: `swapl://swaps/${proposalId}` },
  })),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapProposal: { findUnique: mocks.findUniqueProposal },
    swapMessage: { create: mocks.createMessage, findMany: mocks.findManyMessages },
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { swapMessageReceived: mocks.swapMessageReceivedEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { swapMessageReceived: mocks.swapMessageReceivedPush },
}));

import { GET, POST } from "@/app/api/proposals/[id]/messages/route";

const proposal = {
  id: "prop-1",
  proposerId: "u-proposer",
  proposerListing: { user: { id: "u-proposer", email: "ana@swapl.test" } },
  targetListing: { userId: "u-target", user: { id: "u-target", email: "ben@swapl.test" } },
};

function post(body: unknown) {
  return POST(
    new Request("https://swapl.test/api/proposals/prop-1/messages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "prop-1" }) }
  );
}

function get() {
  return GET(new Request("https://swapl.test/api/proposals/prop-1/messages"), {
    params: Promise.resolve({ id: "prop-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.findUniqueProposal.mockResolvedValue(proposal);
  mocks.findManyMessages.mockResolvedValue([]);
  mocks.createMessage.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
    id: "msg-1",
    proposalId: data.proposalId,
    authorId: data.authorId,
    body: data.body,
    createdAt: new Date("2026-06-10T12:00:00Z"),
  }));
});

describe("POST /api/proposals/[id]/messages", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await post({ body: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects users who are not a party to the proposal", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-stranger" });
    const res = await post({ body: "hi" });
    expect(res.status).toBe(403);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("404s for a missing proposal", async () => {
    mocks.findUniqueProposal.mockResolvedValue(null);
    const res = await post({ body: "hi" });
    expect(res.status).toBe(404);
  });

  it("rejects an empty or whitespace-only body", async () => {
    expect((await post({ body: "" })).status).toBe(400);
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("rejects a body over 4000 chars", async () => {
    const res = await post({ body: "x".repeat(4001) });
    expect(res.status).toBe(400);
  });

  it("creates the message and notifies the other party", async () => {
    const res = await post({ body: "See you in Lisbon!" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message).toMatchObject({
      id: "msg-1",
      proposalId: "prop-1",
      authorId: "u-proposer",
      body: "See you in Lisbon!",
      mine: true,
    });
    // Proposer posted, so the target gets the email + push.
    expect(mocks.swapMessageReceivedEmail).toHaveBeenCalledWith("ben@swapl.test", "Ana");
    expect(mocks.sendPush).toHaveBeenCalledWith(
      "u-target",
      expect.objectContaining({ data: expect.objectContaining({ proposalId: "prop-1" }) })
    );
  });

  it("notifies the proposer when the target posts", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-target", email: "ben@swapl.test", name: "Ben" });
    const res = await post({ body: "Sounds good." });
    expect(res.status).toBe(201);
    expect(mocks.swapMessageReceivedEmail).toHaveBeenCalledWith("ana@swapl.test", "Ben");
    expect(mocks.sendPush).toHaveBeenCalledWith("u-proposer", expect.anything());
  });
});

describe("GET /api/proposals/[id]/messages", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("rejects non-parties", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-stranger" });
    expect((await get()).status).toBe(403);
  });

  it("returns the thread for a party, oldest first, flagging own messages", async () => {
    mocks.findManyMessages.mockResolvedValue([
      { id: "m1", proposalId: "prop-1", authorId: "u-proposer", body: "hi", createdAt: new Date("2026-06-01") },
      { id: "m2", proposalId: "prop-1", authorId: "u-target", body: "hey", createdAt: new Date("2026-06-02") },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"]);
    expect(json.messages[0].mine).toBe(true);
    expect(json.messages[1].mine).toBe(false);
    expect(mocks.findManyMessages).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    );
  });
});
