// Admin moderation endpoints (DOK-121):
//   POST /api/admin/users/[id]     — suspend | reactivate (+ token revocation)
//   POST /api/admin/listings/[id]  — deactivate | reactivate
//   POST /api/admin/reports/[id]   — resolve | dismiss with optional note
// Plus suspension enforcement (DOK-121 follow-up): browse query, public
// profile, and proposal accept/counter/message for suspended accounts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  authTokenUpdateMany: vi.fn(),
  listingFindUnique: vi.fn(),
  listingFindMany: vi.fn(),
  listingCount: vi.fn(),
  listingUpdate: vi.fn(),
  reportFindUnique: vi.fn(),
  reportUpdate: vi.fn(),
  proposalFindUnique: vi.fn(),
  proposalUpdate: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock("@/lib/auth/abilities", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    authToken: { updateMany: mocks.authTokenUpdateMany },
    listing: {
      findUnique: mocks.listingFindUnique,
      findMany: mocks.listingFindMany,
      count: mocks.listingCount,
      update: mocks.listingUpdate,
    },
    report: { findUnique: mocks.reportFindUnique, update: mocks.reportUpdate },
    swapProposal: { findUnique: mocks.proposalFindUnique, update: mocks.proposalUpdate },
    swapMessage: { create: mocks.messageCreate },
    swapMessageEmailThrottle: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    // Multi-party conversation (DOK-187) — no guests in moderation scenarios.
    conversationParticipant: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    // Public profile (DOK-147) stats/reviews — empty defaults keep the
    // moderation assertions focused on suspension behaviour.
    swapAgreement: { findMany: vi.fn(async () => []) },
    swapReview: {
      aggregate: vi.fn(async () => ({ _count: 0, _avg: { rating: null } })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
  },
  parseJSON: <T,>(s: string | null | undefined, fallback: T): T => {
    try {
      return s ? (JSON.parse(s) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  stringifyJSON: (v: unknown): string => JSON.stringify(v ?? null),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  emailTemplates: {
    proposalAccepted: vi.fn(() => ({})),
    proposalDeclined: vi.fn(() => ({})),
    proposalCountered: vi.fn(() => ({})),
    swapMessageReceived: vi.fn(() => ({})),
  },
}));
vi.mock("@/lib/push", () => ({
  sendPush: vi.fn(async () => {}),
  pushTemplates: {
    proposalAccepted: vi.fn(() => ({})),
    proposalDeclined: vi.fn(() => ({})),
    proposalCountered: vi.fn(() => ({})),
    swapMessageReceived: vi.fn(() => ({})),
  },
}));
vi.mock("@/lib/insurance", () => ({
  insuranceProvider: () => ({ name: "mock", createPolicy: vi.fn() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ ok: true }),
  checkRateLimitDurable: async () => ({ ok: true }),
  clientIpFromRequest: () => "test-ip",
}));

import { POST as postUser } from "@/app/api/admin/users/[id]/route";
import { POST as postListing } from "@/app/api/admin/listings/[id]/route";
import { POST as postReport } from "@/app/api/admin/reports/[id]/route";
import { GET as getProfile } from "@/app/api/profiles/[id]/route";
import { POST as postProposalAction } from "@/app/api/proposals/[id]/route";
import { POST as postMessage } from "@/app/api/proposals/[id]/messages/route";
import { queryListings } from "@/lib/listing-query";
import { parseFiltersFromSearchParams } from "@/lib/listing-filters";

function req(path: string, body?: unknown) {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Route handlers receive Next's RouteContext; the tests only need `params`.
function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", role: "swapl_admin" });
  mocks.userUpdate.mockResolvedValue({});
  mocks.authTokenUpdateMany.mockResolvedValue({ count: 0 });
  mocks.listingUpdate.mockResolvedValue({});
  mocks.reportUpdate.mockResolvedValue({});
});

describe("POST /api/admin/users/[id]", () => {
  it("returns 403 for non-admins and never touches the DB", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await postUser(req("/api/admin/users/u1", { action: "suspend" }), ctx("u1"));
    expect(res.status).toBe(403);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects unknown actions with 400", async () => {
    const res = await postUser(req("/api/admin/users/u1", { action: "ban" }), ctx("u1"));
    expect(res.status).toBe(400);
  });

  it("404s when the user does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const res = await postUser(req("/api/admin/users/nope", { action: "suspend" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("suspends an active user and revokes their live auth tokens", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", role: "member", suspendedAt: null });
    const res = await postUser(req("/api/admin/users/u1", { action: "suspend" }), ctx("u1"));
    expect(res.status).toBe(200);
    // SEC-AUTH-02: suspend also bumps the session epoch to kill live web cookies.
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { suspendedAt: expect.any(Date), sessionEpoch: { increment: 1 } },
    });
    expect(mocks.authTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("refuses to suspend the calling admin", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "swapl_admin", suspendedAt: null });
    const res = await postUser(req("/api/admin/users/admin-1", { action: "suspend" }), ctx("admin-1"));
    expect(res.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("409s when suspending an already-suspended user", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", role: "member", suspendedAt: new Date() });
    const res = await postUser(req("/api/admin/users/u1", { action: "suspend" }), ctx("u1"));
    expect(res.status).toBe(409);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("reactivates a suspended user by clearing suspendedAt", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", role: "member", suspendedAt: new Date() });
    const res = await postUser(req("/api/admin/users/u1", { action: "reactivate" }), ctx("u1"));
    expect(res.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { suspendedAt: null },
    });
  });

  it("409s when reactivating a user who is not suspended", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", role: "member", suspendedAt: null });
    const res = await postUser(req("/api/admin/users/u1", { action: "reactivate" }), ctx("u1"));
    expect(res.status).toBe(409);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/listings/[id]", () => {
  it("returns 403 for non-admins", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await postListing(req("/api/admin/listings/l1", { action: "deactivate" }), ctx("l1"));
    expect(res.status).toBe(403);
    expect(mocks.listingFindUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with 400", async () => {
    const res = await postListing(req("/api/admin/listings/l1"), ctx("l1"));
    expect(res.status).toBe(400);
  });

  it("404s when the listing does not exist", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    const res = await postListing(req("/api/admin/listings/nope", { action: "deactivate" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("deactivates an active listing", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l1", isActive: true });
    const res = await postListing(req("/api/admin/listings/l1", { action: "deactivate" }), ctx("l1"));
    expect(res.status).toBe(200);
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { isActive: false },
    });
  });

  it("reactivates an inactive listing", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l1", isActive: false });
    const res = await postListing(req("/api/admin/listings/l1", { action: "reactivate" }), ctx("l1"));
    expect(res.status).toBe(200);
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { isActive: true },
    });
  });

  it("409s on a no-op toggle", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l1", isActive: true });
    const res = await postListing(req("/api/admin/listings/l1", { action: "reactivate" }), ctx("l1"));
    expect(res.status).toBe(409);
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/reports/[id]", () => {
  it("returns 403 for non-admins", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await postReport(req("/api/admin/reports/r1", { action: "resolve" }), ctx("r1"));
    expect(res.status).toBe(403);
    expect(mocks.reportFindUnique).not.toHaveBeenCalled();
  });

  it("rejects unknown actions with 400", async () => {
    const res = await postReport(req("/api/admin/reports/r1", { action: "close" }), ctx("r1"));
    expect(res.status).toBe(400);
  });

  it("404s when the report does not exist", async () => {
    mocks.reportFindUnique.mockResolvedValue(null);
    const res = await postReport(req("/api/admin/reports/nope", { action: "resolve" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("resolves an open report, stamping reviewer and note", async () => {
    mocks.reportFindUnique.mockResolvedValue({ id: "r1", status: "open" });
    const res = await postReport(
      req("/api/admin/reports/r1", { action: "resolve", resolution: "Listing deactivated." }),
      ctx("r1")
    );
    expect(res.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: {
        status: "resolved",
        resolution: "Listing deactivated.",
        resolvedAt: expect.any(Date),
        resolvedById: "admin-1",
      },
    });
  });

  it("dismisses an open report without a note (resolution stays null)", async () => {
    mocks.reportFindUnique.mockResolvedValue({ id: "r1", status: "open" });
    const res = await postReport(req("/api/admin/reports/r1", { action: "dismiss" }), ctx("r1"));
    expect(res.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: {
        status: "dismissed",
        resolution: null,
        resolvedAt: expect.any(Date),
        resolvedById: "admin-1",
      },
    });
  });

  it("409s when the report is already closed", async () => {
    mocks.reportFindUnique.mockResolvedValue({ id: "r1", status: "resolved" });
    const res = await postReport(req("/api/admin/reports/r1", { action: "dismiss" }), ctx("r1"));
    expect(res.status).toBe(409);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });
});

// --- Suspension enforcement (follow-up) -------------------------------------

function proposalFixture(overrides: { proposerSuspendedAt?: Date | null; targetSuspendedAt?: Date | null } = {}) {
  return {
    id: "p1",
    status: "PENDING",
    proposerId: "u-proposer",
    proposerListingId: "l-proposer",
    targetListingId: "l-target",
    dateFrom: new Date("2026-07-01"),
    dateTo: new Date("2026-07-10"),
    agreement: null,
    proposerListing: {
      id: "l-proposer",
      userId: "u-proposer",
      user: { id: "u-proposer", email: "ana@swapl.test", suspendedAt: overrides.proposerSuspendedAt ?? null },
    },
    targetListing: {
      id: "l-target",
      userId: "u-target",
      user: { id: "u-target", email: "ben@swapl.test", suspendedAt: overrides.targetSuspendedAt ?? null },
    },
  };
}

describe("browse: queryListings excludes suspended owners", () => {
  it("adds owner suspendedAt: null to the where clause", async () => {
    mocks.listingFindMany.mockResolvedValue([]);
    mocks.listingCount.mockResolvedValue(0);
    const filters = parseFiltersFromSearchParams({ sort: "newest" });
    await queryListings(filters, null);
    expect(mocks.listingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, user: { suspendedAt: null } }),
      })
    );
  });
});

describe("GET /api/profiles/[id] with a suspended host", () => {
  it("404s as if the profile did not exist", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Ana",
      avatar: null,
      bio: null,
      bioVibe: null,
      verified: true,
      interests: null,
      createdAt: new Date("2026-01-01"),
      suspendedAt: new Date("2026-06-01"),
    });
    const res = await getProfile(new Request("http://test/api/profiles/u1"), ctx("u1"));
    expect(res.status).toBe(404);
    expect(mocks.listingFindMany).not.toHaveBeenCalled();
  });

  it("still serves non-suspended hosts", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Ana",
      avatar: null,
      bio: null,
      bioVibe: null,
      verified: true,
      interests: '["surf"]',
      createdAt: new Date("2026-01-01"),
      suspendedAt: null,
    });
    mocks.listingFindMany.mockResolvedValue([]);
    const res = await getProfile(new Request("http://test/api/profiles/u1"), ctx("u1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.interests).toEqual(["surf"]);
  });
});

describe("POST /api/proposals/[id] while suspended", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-proposer", email: "ana@swapl.test", name: "Ana" });
  });

  it("does not let the proposer accept their own proposal", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture());
    const res = await postProposalAction(req("/api/proposals/p1", { action: "accept" }), ctx("p1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Only target can accept." });
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it("blocks accept with 403 ACCOUNT_SUSPENDED when the counterparty is suspended", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-target", email: "ben@swapl.test", name: "Ben" });
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture({ targetSuspendedAt: new Date() }));
    const res = await postProposalAction(req("/api/proposals/p1", { action: "accept" }), ctx("p1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ACCOUNT_SUSPENDED" });
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it("blocks counter with 403 ACCOUNT_SUSPENDED when the caller is suspended", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture({ proposerSuspendedAt: new Date() }));
    const res = await postProposalAction(
      req("/api/proposals/p1", {
        action: "counter",
        counterDateFrom: "2026-08-01",
        counterDateTo: "2026-08-10",
      }),
      ctx("p1")
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ACCOUNT_SUSPENDED" });
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it("still allows withdraw so the other side is not left hanging", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture({ proposerSuspendedAt: new Date() }));
    mocks.proposalUpdate.mockResolvedValue({});
    const res = await postProposalAction(req("/api/proposals/p1", { action: "withdraw" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(mocks.proposalUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "WITHDRAWN" } });
  });
});

describe("POST /api/proposals/[id]/messages while suspended", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-target", email: "ben@swapl.test", name: "Ben" });
  });

  it("blocks posting with 403 ACCOUNT_SUSPENDED when either party is suspended", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture({ targetSuspendedAt: new Date() }));
    const res = await postMessage(req("/api/proposals/p1/messages", { body: "hello" }), ctx("p1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ACCOUNT_SUSPENDED" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("still posts when nobody is suspended", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposalFixture());
    mocks.messageCreate.mockResolvedValue({
      id: "m1",
      proposalId: "p1",
      authorId: "u-target",
      body: "hello",
      createdAt: new Date("2026-06-11T10:00:00Z"),
    });
    const res = await postMessage(req("/api/proposals/p1/messages", { body: "hello" }), ctx("p1"));
    expect(res.status).toBe(201);
    expect(mocks.messageCreate).toHaveBeenCalled();
  });
});
