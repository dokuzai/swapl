// GET /api/admin/signups/export — admin gating and CSV shape (header row,
// quoting of commas/quotes, ISO dates).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/abilities", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: { betaSignup: { findMany: mocks.findMany } } }));

import { GET } from "@/app/api/admin/signups/export/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "swapl_admin" });
  mocks.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/signups/export", () => {
  it("returns 403 for non-admins (and never touches the DB)", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for unauthenticated callers", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await GET()).status).toBe(403);
  });

  it("returns text/csv with a header row and escaped values for admins", async () => {
    mocks.findMany.mockResolvedValue([
      {
        email: "ana@swapl.test",
        source: "instagram",
        medium: "social",
        campaign: 'summer "beta", wave 1',
        term: null,
        content: null,
        landingPage: "/cities/lisbon",
        referrer: null,
        userId: "u1",
        createdAt: new Date("2026-06-01T08:30:00Z"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const body = await res.text();
    const [header, row] = body.trim().split("\n");
    expect(header).toBe("email,source,medium,campaign,term,content,landingPage,referrer,userId,createdAt");
    expect(row).toContain("ana@swapl.test");
    // Comma + quotes in campaign must be quoted and doubled.
    expect(row).toContain('"summer ""beta"", wave 1"');
    expect(row).toContain("2026-06-01T08:30:00.000Z");
  });
});
