// GET /api/admin/metrics — admin gating (cookie OR bearer via
// getSessionFromRequest) and the JSON shape native clients consume. The
// aggregation maths lives in lib/admin/metrics.ts and is covered by
// admin-metrics.test.ts; here getAdminMetrics is mocked. Also pins that
// GET /api/me exposes `user.role` so clients can gate the Metrics entry.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  listingCount: vi.fn(),
  proposalCount: vi.fn(),
  agreementCount: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  getAdminMetrics: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => null),
  requireSession: vi.fn(async () => {
    throw new Error("UNAUTHENTICATED");
  }),
  getSessionFromRequest: mocks.getSessionFromRequest,
  requireSessionFromRequest: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    listing: { count: mocks.listingCount },
    swapProposal: { count: mocks.proposalCount },
    swapAgreement: { count: mocks.agreementCount },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
  parseJSON: <T,>(s: string | null | undefined, fallback: T): T => {
    try {
      return s ? (JSON.parse(s) as T) : fallback;
    } catch {
      return fallback;
    }
  },
}));
vi.mock("@/lib/admin/metrics", () => ({ getAdminMetrics: mocks.getAdminMetrics }));

import { GET as getMetrics } from "@/app/api/admin/metrics/route";
import { GET as getMe } from "@/app/api/me/route";

const METRICS = {
  now: { online: 1, dau: 2, wau: 3, mau: 4 },
  users: { total: 10, emailVerified: 8, withActiveListing: 5, new7d: 1, new30d: 3 },
  listingsPerUser: {
    distribution: { zero: 5, one: 3, two: 1, threePlus: 1 },
    avgPerUserWithListing: 1.6,
    topUsers: [{ id: "u1", name: "Ada", email: "ada@swapl.test", listings: 4 }],
  },
  cities: { totalActiveListings: 8, top: [{ city: "Milan", listings: 4, share: 0.5 }] },
  engagement: {
    proposalsByStatus: { PENDING: 2, ACCEPTED: 1 },
    proposalsTotal: 3,
    proposalAcceptRate: 1 / 3,
    agreementsActive: 1,
    agreementsCompleted: 0,
    messagesTotal: 12,
    messages7d: 4,
    favoritesTotal: 6,
    favorites7d: 2,
    savedSearches: 1,
  },
};

function bearerReq(path: string) {
  return new Request(`http://test${path}`, {
    headers: { Authorization: "Bearer raw-mobile-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminMetrics.mockResolvedValue(METRICS);
});

describe("GET /api/admin/metrics", () => {
  it("403s when there is no session at all", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await getMetrics(bearerReq("/api/admin/metrics"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "FORBIDDEN" });
    expect(mocks.getAdminMetrics).not.toHaveBeenCalled();
  });

  it("403s for a regular member and never computes the metrics", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({
      userId: "u-member",
      email: "member@swapl.test",
      name: "Member",
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-member",
      email: "member@swapl.test",
      name: "Member",
      role: "member",
    });
    const res = await getMetrics(bearerReq("/api/admin/metrics"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "FORBIDDEN" });
    expect(mocks.getAdminMetrics).not.toHaveBeenCalled();
  });

  it("returns the metrics payload for an admin authenticated via bearer token", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({
      userId: "u-admin",
      email: "founder@swapl.test",
      name: "Founder",
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-admin",
      email: "founder@swapl.test",
      name: "Founder",
      role: "swapl_admin",
    });

    const req = bearerReq("/api/admin/metrics");
    const res = await getMetrics(req);
    expect(res.status).toBe(200);

    // The gate must read the session from the request (bearer-capable path),
    // not from the cookie store.
    expect(mocks.getSessionFromRequest).toHaveBeenCalledWith(req);

    const body = await res.json();
    expect(body).toEqual({ ...METRICS, generatedAt: expect.any(String) });
    // generatedAt is a valid ISO timestamp.
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
    // Shape the native clients rely on.
    expect(Object.keys(body).sort()).toEqual(
      ["cities", "engagement", "generatedAt", "listingsPerUser", "now", "users"]
    );
  });
});

describe("GET /api/me role exposure", () => {
  it("exposes user.role so clients can gate the admin Metrics entry", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({
      userId: "u-admin",
      email: "founder@swapl.test",
      name: "Founder",
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-admin",
      email: "founder@swapl.test",
      name: "Founder",
      avatar: null,
      bio: null,
      bioVibe: null,
      verified: true,
      role: "swapl_admin",
      interests: "[]",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.listingCount.mockResolvedValue(0);
    mocks.proposalCount.mockResolvedValue(0);
    mocks.agreementCount.mockResolvedValue(0);
    mocks.subscriptionFindUnique.mockResolvedValue(null);

    const res = await getMe(bearerReq("/api/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe("swapl_admin");
  });
});
