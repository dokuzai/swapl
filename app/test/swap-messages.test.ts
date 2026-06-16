// POST/GET /api/proposals/[id]/messages and /read — party-only authorization,
// body/attachment validation, pagination, unread/read-marking, and throttled
// email fan-out. Prisma + adapters are mocked so the route logic runs
// hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-proposer", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findUniqueProposal: vi.fn(),
  createMessage: vi.fn(),
  findManyMessages: vi.fn(),
  updateManyMessages: vi.fn(),
  countMessages: vi.fn(),
  crFindMany: vi.fn(),
  crFindUnique: vi.fn(),
  crUpsert: vi.fn(),
  findUniqueThrottle: vi.fn(),
  upsertThrottle: vi.fn(),
  cpFindFirst: vi.fn(),
  cpFindMany: vi.fn(),
  findManyUsers: vi.fn(),
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
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    parseJSON: actual.parseJSON,
    stringifyJSON: actual.stringifyJSON,
    prisma: {
      swapProposal: { findUnique: mocks.findUniqueProposal },
      swapMessage: {
        create: mocks.createMessage,
        findMany: mocks.findManyMessages,
        updateMany: mocks.updateManyMessages,
        count: mocks.countMessages,
      },
      conversationRead: {
        findMany: mocks.crFindMany,
        findUnique: mocks.crFindUnique,
        upsert: mocks.crUpsert,
      },
      swapMessageEmailThrottle: {
        findUnique: mocks.findUniqueThrottle,
        upsert: mocks.upsertThrottle,
      },
      conversationParticipant: {
        findFirst: mocks.cpFindFirst,
        findMany: mocks.cpFindMany,
      },
      user: { findMany: mocks.findManyUsers },
    },
  };
});
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { swapMessageReceived: mocks.swapMessageReceivedEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { swapMessageReceived: mocks.swapMessageReceivedPush },
}));

import { GET, POST } from "@/app/api/proposals/[id]/messages/route";
import { POST as READ } from "@/app/api/proposals/[id]/messages/read/route";

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

function get(query = "") {
  return GET(new Request(`https://swapl.test/api/proposals/prop-1/messages${query}`), {
    params: Promise.resolve({ id: "prop-1" }),
  });
}

function read() {
  return READ(
    new Request("https://swapl.test/api/proposals/prop-1/messages/read", { method: "POST" }),
    { params: Promise.resolve({ id: "prop-1" }) }
  );
}

const row = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  proposalId: "prop-1",
  authorId: "u-target",
  body: "hi",
  photos: "[]",
  readAt: null,
  createdAt: new Date("2026-06-01"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.findUniqueProposal.mockResolvedValue(proposal);
  mocks.findManyMessages.mockResolvedValue([]);
  mocks.updateManyMessages.mockResolvedValue({ count: 0 });
  mocks.countMessages.mockResolvedValue(0);
  mocks.crFindMany.mockResolvedValue([]); // no read cursors by default
  mocks.crFindUnique.mockResolvedValue(null);
  mocks.crUpsert.mockResolvedValue({});
  mocks.findUniqueThrottle.mockResolvedValue(null);
  mocks.upsertThrottle.mockResolvedValue({});
  mocks.cpFindFirst.mockResolvedValue(null); // no guest seat by default
  mocks.cpFindMany.mockResolvedValue([]); // no guest participants by default
  mocks.findManyUsers.mockResolvedValue([]);
  mocks.createMessage.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
    id: "msg-1",
    proposalId: data.proposalId,
    authorId: data.authorId,
    body: data.body,
    photos: data.photos ?? "[]",
    readAt: null,
    createdAt: new Date("2026-06-10T12:00:00Z"),
  }));
});

describe("POST /api/proposals/[id]/messages", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await post({ body: "hi" })).status).toBe(401);
  });

  it("rejects users who are not a party to the proposal", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-stranger" });
    const res = await post({ body: "hi" });
    expect(res.status).toBe(403);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("404s for a missing proposal", async () => {
    mocks.findUniqueProposal.mockResolvedValue(null);
    expect((await post({ body: "hi" })).status).toBe(404);
  });

  it("rejects a message with neither text nor photos", async () => {
    expect((await post({ body: "" })).status).toBe(400);
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ photos: [] })).status).toBe(400);
  });

  it("rejects a body over 4000 chars", async () => {
    expect((await post({ body: "x".repeat(4001) })).status).toBe(400);
  });

  it("rejects non-URL or too many photos", async () => {
    expect((await post({ body: "hi", photos: ["not a url"] })).status).toBe(400);
    expect((await post({ body: "hi", photos: Array(11).fill("https://x.test/a.jpg") })).status).toBe(400);
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
      photos: [],
      readAt: null,
    });
    expect(mocks.sendPush).toHaveBeenCalledWith(
      "u-target",
      expect.objectContaining({ data: expect.objectContaining({ proposalId: "prop-1" }) })
    );
  });

  it("accepts and stores photo attachments", async () => {
    const res = await post({ body: "", photos: ["https://cdn.test/a.jpg"] });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message.photos).toEqual(["https://cdn.test/a.jpg"]);
    expect(mocks.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ photos: '["https://cdn.test/a.jpg"]' }) })
    );
  });

  it("notifies the proposer when the target posts", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-target", email: "ben@swapl.test", name: "Ben" });
    const res = await post({ body: "Sounds good." });
    expect(res.status).toBe(201);
    expect(mocks.sendPush).toHaveBeenCalledWith("u-proposer", expect.anything());
  });
});

describe("guest participants (DOK-187)", () => {
  const guest = { userId: "u-guest", email: "cara@swapl.test", name: "Cara" };

  it("lets an active guest read the thread", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(guest);
    mocks.cpFindFirst.mockResolvedValue({ id: "cp-1" }); // active guest seat
    expect((await get()).status).toBe(200);
  });

  it("lets an active guest post a message", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(guest);
    mocks.cpFindFirst.mockResolvedValue({ id: "cp-1" });
    const res = await post({ body: "Counting down to Lisbon!" });
    expect(res.status).toBe(201);
    expect((await res.json()).message.authorId).toBe("u-guest");
    // Both principals get notified (author is the guest, so not them).
    expect(mocks.sendPush).toHaveBeenCalledWith("u-proposer", expect.anything());
    expect(mocks.sendPush).toHaveBeenCalledWith("u-target", expect.anything());
  });

  it("403s a stranger with no guest seat on read and write", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-stranger", email: "x@x.test", name: "X" });
    mocks.cpFindFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(403);
    expect((await post({ body: "hi" })).status).toBe(403);
  });

  it("fans out a principal's message to active guests too", async () => {
    mocks.cpFindMany.mockResolvedValue([{ userId: "u-guest" }]);
    mocks.findManyUsers.mockResolvedValue([{ id: "u-guest", email: "cara@swapl.test" }]);
    const res = await post({ body: "Welcome aboard" });
    expect(res.status).toBe(201);
    expect(mocks.sendPush).toHaveBeenCalledWith("u-guest", expect.anything());
    expect(mocks.sendPush).toHaveBeenCalledWith("u-target", expect.anything());
  });
});

describe("email throttle", () => {
  it("sends an email on the first message (no throttle row)", async () => {
    await post({ body: "hi" });
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget settle
    expect(mocks.swapMessageReceivedEmail).toHaveBeenCalledWith("ben@swapl.test", "Ana");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.upsertThrottle).toHaveBeenCalled();
  });

  it("suppresses the email when within the throttle window", async () => {
    mocks.findUniqueThrottle.mockResolvedValue({
      proposalId: "prop-1",
      recipientId: "u-target",
      lastEmailedAt: new Date(), // just emailed
    });
    await post({ body: "hi again" });
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    // Push still fires every message.
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("sends again once the throttle window has elapsed", async () => {
    mocks.findUniqueThrottle.mockResolvedValue({
      proposalId: "prop-1",
      recipientId: "u-target",
      lastEmailedAt: new Date(Date.now() - 60 * 60 * 1000), // an hour ago
    });
    await post({ body: "hi" });
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
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

  it("returns the thread oldest-first, flagging own messages, with photos", async () => {
    // Route fetches newest-first; it reverses to oldest-first for display.
    mocks.findManyMessages.mockResolvedValue([
      row({ id: "m2", authorId: "u-target", body: "hey", createdAt: new Date("2026-06-02") }),
      row({ id: "m1", authorId: "u-proposer", body: "hi", photos: '["https://cdn.test/a.jpg"]', createdAt: new Date("2026-06-01") }),
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"]);
    expect(json.messages[0].mine).toBe(true);
    expect(json.messages[0].photos).toEqual(["https://cdn.test/a.jpg"]);
    expect(json.messages[1].mine).toBe(false);
  });

  it("paginates: over-fetches limit+1 and returns nextCursor when more exist", async () => {
    mocks.findManyMessages.mockResolvedValue([
      row({ id: "m3", createdAt: new Date("2026-06-03") }),
      row({ id: "m2", createdAt: new Date("2026-06-02") }),
      row({ id: "m1", createdAt: new Date("2026-06-01") }),
    ]);
    const res = await get("?limit=2");
    const json = await res.json();
    expect(mocks.findManyMessages).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3, orderBy: { createdAt: "desc" } })
    );
    expect(json.messages).toHaveLength(2);
    expect(json.hasMore).toBe(true);
    expect(json.nextCursor).toBe("m2"); // oldest of the returned window
  });

  it("passes cursor through with skip:1", async () => {
    await get("?cursor=m5");
    expect(mocks.findManyMessages).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "m5" }, skip: 1 })
    );
  });

  it("advances only the caller's own read cursor by default (DOK-195)", async () => {
    await get();
    expect(mocks.crUpsert).toHaveBeenCalledWith({
      where: { proposalId_userId: { proposalId: "prop-1", userId: "u-proposer" } },
      create: { proposalId: "prop-1", userId: "u-proposer", lastReadAt: expect.any(Date) },
      update: { lastReadAt: expect.any(Date) },
    });
    // Per-recipient: it must NOT mutate the shared message rows anymore.
    expect(mocks.updateManyMessages).not.toHaveBeenCalled();
  });

  it("skips read-marking when markRead=false", async () => {
    await get("?markRead=false");
    expect(mocks.crUpsert).not.toHaveBeenCalled();
  });

  it("flags ✓✓ only once the recipient principal's cursor passes the message (DOK-195)", async () => {
    // Viewer (u-proposer) sent m1; recipient principal is u-target.
    mocks.findManyMessages.mockResolvedValue([
      row({ id: "m1", authorId: "u-proposer", createdAt: new Date("2026-06-01T00:00:00Z") }),
    ]);
    // u-target has read up to a point AFTER m1 → m1 shows as read.
    mocks.crFindMany.mockResolvedValue([
      { userId: "u-target", lastReadAt: new Date("2026-06-02T00:00:00Z") },
    ]);
    const read1 = await (await get()).json();
    expect(read1.messages[0].readAt).toBe(new Date("2026-06-02T00:00:00Z").toISOString());

    // u-target's cursor is BEFORE m1 → not read yet.
    mocks.crFindMany.mockResolvedValue([
      { userId: "u-target", lastReadAt: new Date("2026-05-30T00:00:00Z") },
    ]);
    const read2 = await (await get()).json();
    expect(read2.messages[0].readAt).toBeNull();
  });
});

describe("POST /api/proposals/[id]/messages/read", () => {
  it("rejects unauthenticated and non-parties", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    mocks.getSessionFromRequest.mockResolvedValue({ ...session, userId: "u-stranger" });
    expect((await read()).status).toBe(403);
  });

  it("advances the caller's cursor and reports how many it cleared (DOK-195)", async () => {
    mocks.crFindUnique.mockResolvedValue({ lastReadAt: new Date("2026-06-01T00:00:00Z") });
    mocks.countMessages.mockResolvedValue(3);
    const res = await read();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, marked: 3 });
    // Counts inbound messages newer than the caller's prior cursor...
    expect(mocks.countMessages).toHaveBeenCalledWith({
      where: {
        proposalId: "prop-1",
        authorId: { not: "u-proposer" },
        createdAt: { gt: new Date("2026-06-01T00:00:00Z") },
      },
    });
    // ...then advances only the caller's own cursor.
    expect(mocks.crUpsert).toHaveBeenCalledWith({
      where: { proposalId_userId: { proposalId: "prop-1", userId: "u-proposer" } },
      create: { proposalId: "prop-1", userId: "u-proposer", lastReadAt: expect.any(Date) },
      update: { lastReadAt: expect.any(Date) },
    });
  });
});
