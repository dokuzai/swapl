// GET /api/keys/transactions (DOK-157): auth, kind filter validation, cursor
// pagination with the "+1 to detect next page" contract, and balanceAfter
// passthrough. Mocks the prisma + session surface the route touches.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u1", email: "u@swapl.test", name: "U" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({ prisma: { keysTransaction: { findMany: mocks.findMany } } }));

import { GET } from "@/app/api/keys/transactions/route";

function get(qs = "") {
  return GET(new Request(`https://swapl.test/api/keys/transactions${qs}`));
}

function row(id: string, balanceAfter: number, kind = "earn_host") {
  return { id, delta: 10, kind, balanceAfter, stayId: null, note: null, createdAt: new Date() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
});

describe("GET /api/keys/transactions", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("rejects an unknown kind", async () => {
    const res = await get("?kind=bogus");
    expect(res.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range limit", async () => {
    expect((await get("?limit=0")).status).toBe(400);
    expect((await get("?limit=500")).status).toBe(400);
  });

  it("returns a page with balanceAfter and no next cursor when not full", async () => {
    mocks.findMany.mockResolvedValue([row("t2", 20), row("t1", 10)]);
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]).toMatchObject({ id: "t2", balanceAfter: 20 });
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("detects a next page and emits the last id as the cursor", async () => {
    // limit=2 -> route asks for 3; getting 3 back means hasMore.
    mocks.findMany.mockResolvedValue([row("t3", 30), row("t2", 20), row("t1", 10)]);
    const res = await get("?limit=2");
    const body = await res.json();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(body.transactions).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("t2");
  });

  it("passes the kind filter and cursor through to prisma", async () => {
    mocks.findMany.mockResolvedValue([]);
    await get("?kind=referral_bonus&cursor=tX");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", kind: "referral_bonus" },
        cursor: { id: "tX" },
        skip: 1,
      }),
    );
  });
});
