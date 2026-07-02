// Dispute / resolution center (DOK-153):
//   POST/GET /api/agreements/{id}/dispute  — party gating, urgent flag, photos,
//                                             other-party + admin notification.
//   POST     /api/disputes/{id}/message    — party|admin gating, status nudges,
//                                             terminal 409, message notify.
//   POST     /api/admin/disputes/{id}      — admin state machine + party notify.
// Prisma + session + notifiers mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  requireAdminFromRequest: vi.fn(),
  agreementFindUnique: vi.fn(),
  stayFindUnique: vi.fn(),
  disputeCreate: vi.fn(),
  disputeFindUnique: vi.fn(),
  disputeFindMany: vi.fn(),
  disputeUpdate: vi.fn(),
  messageCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  emailTemplates: {
    disputeOpened: vi.fn((to: string) => ({ to, subject: "opened", text: "" })),
    disputeOpenedAdmin: vi.fn((to: string) => ({ to, subject: "opened-admin", text: "" })),
    disputeStatusChanged: vi.fn((to: string) => ({ to, subject: "status", text: "" })),
    disputeMessage: vi.fn((to: string) => ({ to, subject: "msg", text: "" })),
  },
  pushTemplates: {
    disputeOpened: vi.fn(() => ({ title: "", body: "", data: { kind: "disputeOpened", deepLink: "" } })),
    disputeStatusChanged: vi.fn(() => ({ title: "", body: "", data: { kind: "disputeStatusChanged", deepLink: "" } })),
    disputeMessage: vi.fn(() => ({ title: "", body: "", data: { kind: "disputeMessage", deepLink: "" } })),
  },
}));

const emailTemplates = mocks.emailTemplates;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/auth/abilities", () => ({ requireAdminFromRequest: mocks.requireAdminFromRequest }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail, emailTemplates: mocks.emailTemplates }));
vi.mock("@/lib/push", () => ({ sendPush: mocks.sendPush, pushTemplates: mocks.pushTemplates }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: { findUnique: mocks.agreementFindUnique },
    keysStay: { findUnique: mocks.stayFindUnique },
    swapDispute: {
      create: mocks.disputeCreate,
      findUnique: mocks.disputeFindUnique,
      findMany: mocks.disputeFindMany,
      update: mocks.disputeUpdate,
    },
    disputeMessage: { create: mocks.messageCreate },
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
  },
}));

import { POST as openDispute, GET as getDispute } from "@/app/api/agreements/[id]/dispute/route";
import { POST as openStayDispute, GET as getStayDispute } from "@/app/api/keys/stays/[id]/dispute/route";
import { POST as postMessage } from "@/app/api/disputes/[id]/message/route";
import { POST as adminAction } from "@/app/api/admin/disputes/[id]/route";

const NOW = new Date("2026-06-15T12:00:00Z");

function agreement(over: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    proposalId: "prop-1",
    status: "ACTIVE",
    listing1: { userId: "u1", user: { id: "u1", name: "Ana", email: "ana@swapl.test" } },
    listing2: { userId: "u2", user: { id: "u2", name: "Ben", email: "ben@swapl.test" } },
    ...over,
  };
}

function req(url: string, body: unknown = {}, method = "POST") {
  return new Request(url, {
    method,
    headers: { "x-forwarded-for": `ip-${Math.random()}`, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u1" });
  mocks.agreementFindUnique.mockResolvedValue(agreement());
  mocks.userFindMany.mockResolvedValue([{ email: "admin@swapl.test" }]);
  mocks.disputeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "dis-1",
    status: "open",
    resolution: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...data,
  }));
});

describe("POST open dispute — gating + urgent + notify", () => {
  it("401 unauthenticated", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await openDispute(req("https://x/api/agreements/agr-1/dispute", { category: "other", description: "x" }), ctx("agr-1"))).status).toBe(401);
  });

  it("403 for a non-party", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "stranger" });
    expect((await openDispute(req("https://x", { category: "other", description: "x" }), ctx("agr-1"))).status).toBe(403);
  });

  it("404 when the agreement is missing", async () => {
    mocks.agreementFindUnique.mockResolvedValue(null);
    expect((await openDispute(req("https://x", { category: "other", description: "x" }), ctx("agr-1"))).status).toBe(404);
  });

  it("400 on bad category / empty description", async () => {
    expect((await openDispute(req("https://x", { category: "nope", description: "x" }), ctx("agr-1"))).status).toBe(400);
    expect((await openDispute(req("https://x", { category: "other", description: "" }), ctx("agr-1"))).status).toBe(400);
  });

  it("creates the dispute, flags safety as urgent, notifies the OTHER party + admin", async () => {
    const res = await openDispute(
      req("https://x", { category: "safety", description: "Smoke alarm went off", photos: ["https://cdn.swapl.test/a.jpg"] }),
      ctx("agr-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispute.urgent).toBe(true);
    expect(json.dispute.photos).toEqual(["https://cdn.swapl.test/a.jpg"]);
    // Ana (u1) opened -> Ben (u2) notified, plus admin inbox.
    expect(emailTemplates.disputeOpened).toHaveBeenCalledWith("ben@swapl.test", "prop-1", "safety", true);
    expect(mocks.sendPush).toHaveBeenCalledWith("u2", expect.anything());
    await Promise.resolve();
    expect(emailTemplates.disputeOpenedAdmin).toHaveBeenCalled();
  });

  it("non-urgent category is not flagged urgent", async () => {
    const res = await openDispute(req("https://x", { category: "cleanliness", description: "dust" }), ctx("agr-1"));
    expect((await res.json()).dispute.urgent).toBe(false);
  });

  it("429 returns a RATE_LIMITED code + human message once the per-user cap is hit", async () => {
    // The open limiter is keyed on the user (5 / 10 min), independent of IP, so
    // a fresh user trips it on the 6th call within the window. The user must be
    // a party of the agreement to clear the gating ahead of the limiter check.
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "ratelimit-victim" });
    mocks.agreementFindUnique.mockResolvedValue(
      agreement({ listing1: { userId: "ratelimit-victim", user: { id: "ratelimit-victim", name: "RL", email: "rl@swapl.test" } } }),
    );
    const body = { category: "other", description: "again" };
    for (let i = 0; i < 5; i++) {
      expect((await openDispute(req("https://x", body), ctx("agr-1"))).status).toBe(200);
    }
    const limited = await openDispute(req("https://x", body), ctx("agr-1"));
    expect(limited.status).toBe(429);
    const json = await limited.json();
    expect(json.error).toBe("RATE_LIMITED");
    expect(typeof json.message).toBe("string");
    expect(json.message.length).toBeGreaterThan(0);
  });
});

describe("GET dispute timeline", () => {
  it("403 for a non-party", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "stranger" });
    expect((await getDispute(req("https://x", undefined, "GET"), ctx("agr-1"))).status).toBe(403);
  });

  it("returns disputes with mapped messages for a party", async () => {
    mocks.disputeFindMany.mockResolvedValue([
      {
        id: "dis-1", category: "access", status: "investigating", description: "locked out",
        photos: "[]", resolution: null, createdAt: NOW, updatedAt: NOW,
        openedBy: { id: "u1", name: "Ana" },
        messages: [{ id: "m1", authorId: "u2", body: "sorry!", photos: "[]", createdAt: NOW, author: { id: "u2", name: "Ben" } }],
      },
    ]);
    const res = await getDispute(req("https://x", undefined, "GET"), ctx("agr-1"));
    const json = await res.json();
    expect(json.disputes[0].urgent).toBe(true); // access is urgent
    expect(json.disputes[0].messages[0].authorName).toBe("Ben");
  });
});

describe("POST dispute message — gating + status nudges", () => {
  function dispute(over: Record<string, unknown> = {}) {
    return {
      id: "dis-1",
      status: "open",
      agreement: {
        proposalId: "prop-1",
        listing1: { user: { id: "u1", name: "Ana", email: "ana@swapl.test" } },
        listing2: { user: { id: "u2", name: "Ben", email: "ben@swapl.test" } },
      },
      ...over,
    };
  }
  beforeEach(() => {
    mocks.disputeFindUnique.mockResolvedValue(dispute());
    mocks.userFindUnique.mockResolvedValue({ id: "u1", name: "Ana", role: "member" });
    mocks.messageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "msg-1", createdAt: NOW, ...data,
    }));
  });

  it("403 for someone who is neither party nor admin", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "stranger", name: "S", role: "member" });
    expect((await postMessage(req("https://x", { body: "hi" }), ctx("dis-1"))).status).toBe(403);
  });

  it("409 when the dispute is resolved/closed", async () => {
    mocks.disputeFindUnique.mockResolvedValue(dispute({ status: "resolved" }));
    expect((await postMessage(req("https://x", { body: "hi" }), ctx("dis-1"))).status).toBe(409);
  });

  it("a party reply nudges status to investigating + notifies the other party + admin", async () => {
    const res = await postMessage(req("https://x", { body: "the key didn't work" }), ctx("dis-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("investigating");
    expect(mocks.disputeUpdate).toHaveBeenCalledWith({ where: { id: "dis-1" }, data: { status: "investigating" } });
    expect(emailTemplates.disputeMessage).toHaveBeenCalledWith("ben@swapl.test", "prop-1", "Ana");
    await Promise.resolve();
    expect(emailTemplates.disputeMessage).toHaveBeenCalledWith("admin@swapl.test", "prop-1", "Ana");
  });

  it("an admin reply nudges status to awaiting_response + notifies both parties", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "adm", name: "Support", role: "swapl_admin" });
    const res = await postMessage(req("https://x", { body: "looking into it" }), ctx("dis-1"));
    expect((await res.json()).status).toBe("awaiting_response");
    expect(emailTemplates.disputeMessage).toHaveBeenCalledWith("ana@swapl.test", "prop-1", "Support");
    expect(emailTemplates.disputeMessage).toHaveBeenCalledWith("ben@swapl.test", "prop-1", "Support");
  });
});

describe("POST admin action — state machine + party notify", () => {
  beforeEach(() => {
    mocks.requireAdminFromRequest.mockResolvedValue({ id: "adm", email: "a@x", name: "Adm", role: "swapl_admin" });
    mocks.disputeFindUnique.mockResolvedValue({
      id: "dis-1",
      status: "open",
      agreement: {
        proposalId: "prop-1",
        listing1: { user: { id: "u1", email: "ana@swapl.test" } },
        listing2: { user: { id: "u2", email: "ben@swapl.test" } },
      },
    });
    mocks.disputeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "dis-1", status: "open", resolution: null, resolvedById: null, ...data,
    }));
  });

  it("403 when not an admin", async () => {
    mocks.requireAdminFromRequest.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await adminAction(req("https://x", { status: "resolved" }), ctx("dis-1"))).status).toBe(403);
  });

  it("400 when nothing to update", async () => {
    expect((await adminAction(req("https://x", {}), ctx("dis-1"))).status).toBe(400);
  });

  it("changes status + records resolution and notifies BOTH parties", async () => {
    const res = await adminAction(req("https://x", { status: "resolved", resolution: "Refunded cleaning" }), ctx("dis-1"));
    expect(res.status).toBe(200);
    expect(mocks.disputeUpdate).toHaveBeenCalledWith({
      where: { id: "dis-1" },
      data: { status: "resolved", resolution: "Refunded cleaning" },
    });
    expect(emailTemplates.disputeStatusChanged).toHaveBeenCalledWith("ana@swapl.test", "prop-1", "resolved", "Refunded cleaning");
    expect(emailTemplates.disputeStatusChanged).toHaveBeenCalledWith("ben@swapl.test", "prop-1", "resolved", "Refunded cleaning");
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
  });

  it("assignToMe sets resolvedById without a status change (no notify)", async () => {
    const res = await adminAction(req("https://x", { assignToMe: true }), ctx("dis-1"));
    expect(res.status).toBe(200);
    expect(mocks.disputeUpdate).toHaveBeenCalledWith({ where: { id: "dis-1" }, data: { resolvedById: "adm" } });
    expect(emailTemplates.disputeStatusChanged).not.toHaveBeenCalled();
  });
});

// ---- JRN-GP-03: disputes on Keys stays ----

function keysStay(over: Record<string, unknown> = {}) {
  return {
    id: "stay-1",
    status: "confirmed",
    guestId: "u1",
    hostId: "u2",
    guest: { id: "u1", name: "Ana", email: "ana@swapl.test" },
    host: { id: "u2", name: "Ben", email: "ben@swapl.test" },
    ...over,
  };
}

describe("POST/GET keys-stay dispute — gating + notify", () => {
  beforeEach(() => {
    mocks.stayFindUnique.mockResolvedValue(keysStay());
  });

  it("401 unauthenticated", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await openStayDispute(req("https://x", { category: "other", description: "x" }), ctx("stay-1"))).status).toBe(401);
  });

  it("403 for a non-party", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "stranger" });
    expect((await openStayDispute(req("https://x", { category: "other", description: "x" }), ctx("stay-1"))).status).toBe(403);
  });

  // Fresh guest ids below: the dispute-open limiter (5/10min, keyed on user)
  // persists across the file under fake timers, so reusing u1 (already burned by
  // the swap tests) would 429 before the assertion.
  it("404 when the stay is missing", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "ks-404" });
    mocks.stayFindUnique.mockResolvedValue(null);
    expect((await openStayDispute(req("https://x", { category: "other", description: "x" }), ctx("stay-1"))).status).toBe(404);
  });

  it("422 when the stay is still pending (not confirmed/completed)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "ks-422" });
    mocks.stayFindUnique.mockResolvedValue(keysStay({ status: "pending", guestId: "ks-422", guest: { id: "ks-422", name: "G", email: "g@x" } }));
    expect((await openStayDispute(req("https://x", { category: "other", description: "problem" }), ctx("stay-1"))).status).toBe(422);
    expect(mocks.disputeCreate).not.toHaveBeenCalled();
  });

  it("creates a keysStay-scoped dispute, notifies the OTHER party + admin", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "ks-ok" });
    mocks.stayFindUnique.mockResolvedValue(keysStay({ guestId: "ks-ok", guest: { id: "ks-ok", name: "Ana", email: "ana@swapl.test" } }));
    const res = await openStayDispute(
      req("https://x", { category: "safety", description: "Lock was broken on arrival" }),
      ctx("stay-1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).dispute.urgent).toBe(true);
    // Created with keysStayId (not agreementId).
    expect(mocks.disputeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ keysStayId: "stay-1", openedById: "ks-ok" }) }),
    );
    // Guest opened -> host (u2) notified; deep-link ref is the STAY id.
    expect(emailTemplates.disputeOpened).toHaveBeenCalledWith("ben@swapl.test", "stay-1", "safety", true);
    expect(mocks.sendPush).toHaveBeenCalledWith("u2", expect.anything());
  });

  it("GET returns the case timeline for a party (403 for a stranger)", async () => {
    mocks.disputeFindMany.mockResolvedValue([
      {
        id: "dis-9", category: "access", status: "open", description: "d", photos: "[]", resolution: null,
        openedBy: { id: "u1", name: "Ana" }, createdAt: NOW, updatedAt: NOW,
        messages: [{ id: "m1", authorId: "u2", author: { id: "u2", name: "Ben" }, body: "hi", photos: "[]", createdAt: NOW }],
      },
    ]);
    const ok = await getStayDispute(req("https://x", undefined, "GET"), ctx("stay-1"));
    expect((await ok.json()).disputes[0].messages[0].authorName).toBe("Ben");

    mocks.getSessionFromRequest.mockResolvedValue({ userId: "stranger" });
    expect((await getStayDispute(req("https://x", undefined, "GET"), ctx("stay-1"))).status).toBe(403);
  });
});

describe("dispute message + admin action work on a KEYS-stay dispute", () => {
  const keysDispute = {
    id: "dis-1",
    status: "open",
    agreement: null,
    keysStay: {
      id: "stay-1",
      guest: { id: "u1", name: "Ana", email: "ana@swapl.test" },
      host: { id: "u2", name: "Ben", email: "ben@swapl.test" },
    },
  };

  it("message route resolves parties from keysStay and refs the stay id (no crash on null agreement)", async () => {
    mocks.disputeFindUnique.mockResolvedValue(keysDispute);
    mocks.userFindUnique.mockResolvedValue({ id: "u1", name: "Ana", role: "member" });
    mocks.messageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "msg-1", createdAt: NOW, ...data }));
    const res = await postMessage(req("https://x", { body: "the door code failed" }), ctx("dis-1"));
    expect(res.status).toBe(200);
    expect(emailTemplates.disputeMessage).toHaveBeenCalledWith("ben@swapl.test", "stay-1", "Ana");
  });

  it("admin action notifies both stay parties with the stay ref (no crash on null agreement)", async () => {
    mocks.requireAdminFromRequest.mockResolvedValue({ id: "adm", email: "a@x", name: "Adm", role: "swapl_admin" });
    mocks.disputeFindUnique.mockResolvedValue(keysDispute);
    mocks.disputeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "dis-1", status: "open", resolution: null, resolvedById: null, ...data }));
    const res = await adminAction(req("https://x", { status: "resolved", resolution: "Refunded the stay" }), ctx("dis-1"));
    expect(res.status).toBe(200);
    expect(emailTemplates.disputeStatusChanged).toHaveBeenCalledWith("ana@swapl.test", "stay-1", "resolved", "Refunded the stay");
    expect(emailTemplates.disputeStatusChanged).toHaveBeenCalledWith("ben@swapl.test", "stay-1", "resolved", "Refunded the stay");
  });
});
