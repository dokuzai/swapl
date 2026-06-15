// Multi-party swap conversation — participant roster + invite/remove
// authorization, idempotency, and the message-thread access extension
// (DOK-187). Prisma + email/push adapters are mocked so the route logic runs
// hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const principalSession = { userId: "u-proposer", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findUniqueProposal: vi.fn(),
  findUserUnique: vi.fn(),
  findManyUsers: vi.fn(),
  cpFindFirst: vi.fn(),
  cpFindMany: vi.fn(),
  cpFindUnique: vi.fn(),
  cpUpsert: vi.fn(),
  cpUpdate: vi.fn(),
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  inviteEmail: vi.fn((to: string) => ({ to, subject: "invited", text: "invited" })),
  invitePush: vi.fn((proposalId: string) => ({
    title: "invited",
    body: "invited",
    data: { kind: "swapParticipantInvited", proposalId, deepLink: `swapl://swaps/${proposalId}` },
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
      user: { findUnique: mocks.findUserUnique, findMany: mocks.findManyUsers },
      conversationParticipant: {
        findFirst: mocks.cpFindFirst,
        findMany: mocks.cpFindMany,
        findUnique: mocks.cpFindUnique,
        upsert: mocks.cpUpsert,
        update: mocks.cpUpdate,
      },
    },
  };
});
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { swapParticipantInvited: mocks.inviteEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { swapParticipantInvited: mocks.invitePush },
}));

import { GET, POST } from "@/app/api/proposals/[id]/participants/route";
import { DELETE } from "@/app/api/proposals/[id]/participants/[participantId]/route";

const proposal = {
  proposerId: "u-proposer",
  proposer: { id: "u-proposer", name: "Ana", avatar: null },
  targetListing: { userId: "u-target", user: { id: "u-target", name: "Ben", avatar: null } },
};

function post(body: unknown, session: typeof principalSession | null = principalSession) {
  mocks.getSessionFromRequest.mockResolvedValue(session);
  return POST(
    new Request("https://swapl.test/api/proposals/prop-1/participants", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "prop-1" }) }
  );
}

function get(session = principalSession) {
  mocks.getSessionFromRequest.mockResolvedValue(session);
  return GET(new Request("https://swapl.test/api/proposals/prop-1/participants"), {
    params: Promise.resolve({ id: "prop-1" }),
  });
}

function del(participantId: string, session = principalSession) {
  mocks.getSessionFromRequest.mockResolvedValue(session);
  return DELETE(
    new Request(`https://swapl.test/api/proposals/prop-1/participants/${participantId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "prop-1", participantId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(principalSession);
  mocks.findUniqueProposal.mockResolvedValue(proposal);
  mocks.findUserUnique.mockResolvedValue(null);
  mocks.findManyUsers.mockResolvedValue([]);
  mocks.cpFindFirst.mockResolvedValue(null);
  mocks.cpFindMany.mockResolvedValue([]);
  mocks.cpFindUnique.mockResolvedValue(null);
  mocks.cpUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: "cp-1",
    ...create,
  }));
  mocks.cpUpdate.mockResolvedValue({});
});

describe("POST /participants — invite by userId", () => {
  it("adds an existing user as an active guest and notifies them", async () => {
    mocks.findUserUnique.mockResolvedValue({
      id: "u-guest",
      name: "Cara",
      avatar: null,
      email: "cara@swapl.test",
    });
    const res = await post({ byUserId: "u-guest" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.participant).toMatchObject({
      userId: "u-guest",
      role: "guest_participant",
      status: "active",
    });
    expect(mocks.cpUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proposalId_userId: { proposalId: "prop-1", userId: "u-guest" } },
      })
    );
    expect(mocks.sendPush).toHaveBeenCalledWith("u-guest", expect.anything());
    expect(mocks.sendEmail).toHaveBeenCalled();
  });

  it("is a no-op when inviting a principal", async () => {
    const res = await post({ byUserId: "u-target" });
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyMember).toBe(true);
    expect(mocks.cpUpsert).not.toHaveBeenCalled();
  });

  it("404s when the user does not exist", async () => {
    mocks.findUserUnique.mockResolvedValue(null);
    const res = await post({ byUserId: "u-nope" });
    expect(res.status).toBe(404);
  });
});

describe("POST /participants — invite by email", () => {
  it("creates a pending seat + sends the invite email for an unknown address", async () => {
    mocks.findUserUnique.mockResolvedValue(null); // no account yet
    const res = await post({ byEmail: "New.Person@Swapl.test" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.participant).toMatchObject({
      invitedEmail: "new.person@swapl.test",
      status: "pending",
    });
    expect(mocks.cpUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proposalId_invitedEmail: { proposalId: "prop-1", invitedEmail: "new.person@swapl.test" },
        },
      })
    );
    expect(mocks.inviteEmail).toHaveBeenCalledWith("new.person@swapl.test", "Ana");
  });

  it("activates immediately when the email already has an account", async () => {
    mocks.findUserUnique.mockResolvedValue({
      id: "u-guest",
      name: "Cara",
      avatar: null,
      email: "cara@swapl.test",
    });
    const res = await post({ byEmail: "cara@swapl.test" });
    expect(res.status).toBe(201);
    expect((await res.json()).participant.status).toBe("active");
  });
});

describe("authorization", () => {
  it("rejects unauthenticated invites", async () => {
    expect((await post({ byUserId: "u-guest" }, null)).status).toBe(401);
  });

  it("403s when a non-principal tries to invite", async () => {
    const res = await post({ byUserId: "u-guest" }, { userId: "u-stranger", email: "x@x.test", name: "X" });
    expect(res.status).toBe(403);
    expect(mocks.cpUpsert).not.toHaveBeenCalled();
  });

  it("rejects invites with neither or both selectors", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ byUserId: "u-guest", byEmail: "a@b.test" })).status).toBe(400);
  });
});

describe("GET /participants", () => {
  it("returns principals plus active guests for a principal", async () => {
    mocks.cpFindMany.mockResolvedValue([
      { id: "cp-1", userId: "u-guest", invitedEmail: null, status: "active", createdAt: new Date() },
    ]);
    mocks.findManyUsers.mockResolvedValue([{ id: "u-guest", name: "Cara", avatar: null }]);
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    const roles = json.participants.map((p: { role: string }) => p.role);
    expect(roles.filter((r: string) => r === "principal")).toHaveLength(2);
    expect(json.participants.find((p: { userId: string }) => p.userId === "u-guest")).toMatchObject({
      role: "guest_participant",
      status: "active",
      name: "Cara",
    });
  });

  it("lets an active guest read the roster", async () => {
    mocks.cpFindFirst.mockResolvedValue({ id: "cp-1" }); // guest has access
    mocks.cpFindMany.mockResolvedValue([]);
    const res = await get({ userId: "u-guest", email: "cara@swapl.test", name: "Cara" });
    expect(res.status).toBe(200);
  });

  it("403s a stranger", async () => {
    mocks.cpFindFirst.mockResolvedValue(null); // no guest seat
    const res = await get({ userId: "u-stranger", email: "x@x.test", name: "X" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /participants/[participantId]", () => {
  it("soft-removes a guest seat (principal only)", async () => {
    mocks.cpFindUnique.mockResolvedValue({
      id: "cp-1",
      proposalId: "prop-1",
      role: "guest_participant",
      status: "active",
    });
    const res = await del("cp-1");
    expect(res.status).toBe(200);
    expect(mocks.cpUpdate).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      data: { status: "removed" },
    });
  });

  it("403s a non-principal", async () => {
    const res = await del("cp-1", { userId: "u-stranger", email: "x@x.test", name: "X" });
    expect(res.status).toBe(403);
    expect(mocks.cpUpdate).not.toHaveBeenCalled();
  });

  it("404s when the participant belongs to another proposal", async () => {
    mocks.cpFindUnique.mockResolvedValue({
      id: "cp-1",
      proposalId: "other-prop",
      role: "guest_participant",
      status: "active",
    });
    expect((await del("cp-1")).status).toBe(404);
  });

  it("is idempotent for an already-removed seat", async () => {
    mocks.cpFindUnique.mockResolvedValue({
      id: "cp-1",
      proposalId: "prop-1",
      role: "guest_participant",
      status: "removed",
    });
    const res = await del("cp-1");
    expect(res.status).toBe(200);
    expect(mocks.cpUpdate).not.toHaveBeenCalled();
  });
});
