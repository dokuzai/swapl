// Admin moderation endpoints (DOK-121):
//   POST /api/admin/users/[id]     — suspend | reactivate (+ token revocation)
//   POST /api/admin/listings/[id]  — deactivate | reactivate
//   POST /api/admin/reports/[id]   — resolve | dismiss with optional note

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  authTokenUpdateMany: vi.fn(),
  listingFindUnique: vi.fn(),
  listingUpdate: vi.fn(),
  reportFindUnique: vi.fn(),
  reportUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/abilities", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    authToken: { updateMany: mocks.authTokenUpdateMany },
    listing: { findUnique: mocks.listingFindUnique, update: mocks.listingUpdate },
    report: { findUnique: mocks.reportFindUnique, update: mocks.reportUpdate },
  },
}));

import { POST as postUser } from "@/app/api/admin/users/[id]/route";
import { POST as postListing } from "@/app/api/admin/listings/[id]/route";
import { POST as postReport } from "@/app/api/admin/reports/[id]/route";

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
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { suspendedAt: expect.any(Date) },
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
