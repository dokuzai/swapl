// POST /api/admin/reviews/[id] — review moderation (DOK-149): admin gating
// (401/403), hide/restore transitions, 404 on missing review, 409 when the
// state is already applied.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFromRequest: vi.fn(),
  reviewFindUnique: vi.fn(),
  reviewUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/abilities", () => ({
  requireAdminFromRequest: mocks.requireAdminFromRequest,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapReview: { findUnique: mocks.reviewFindUnique, update: mocks.reviewUpdate },
  },
}));

import { POST } from "@/app/api/admin/reviews/[id]/route";

const admin = { id: "admin-1", email: "ops@swapl.test", name: "Ops", role: "swapl_admin" };

const publishedReview = {
  id: "rev-1",
  agreementId: "agr-1",
  authorId: "u-2",
  subjectId: "u-1",
  rating: 1,
  text: "abusive text",
  status: "published",
  moderatedAt: null,
  moderatedById: null,
  createdAt: new Date("2026-05-01T00:00:00Z"),
};

function post(body: unknown, id = "rev-1") {
  return POST(
    new Request(`https://swapl.test/api/admin/reviews/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminFromRequest.mockResolvedValue(admin);
  mocks.reviewFindUnique.mockResolvedValue(publishedReview);
  mocks.reviewUpdate.mockImplementation(async ({ data }) => ({ ...publishedReview, ...data }));
});

describe("POST /api/admin/reviews/[id]", () => {
  it("401 when unauthenticated", async () => {
    mocks.requireAdminFromRequest.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const res = await post({ action: "hide" });
    expect(res.status).toBe(401);
    expect(mocks.reviewUpdate).not.toHaveBeenCalled();
  });

  it("403 for non-admin users", async () => {
    mocks.requireAdminFromRequest.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await post({ action: "hide" });
    expect(res.status).toBe(403);
    expect(mocks.reviewUpdate).not.toHaveBeenCalled();
  });

  it("400 on unknown action", async () => {
    expect((await post({ action: "delete" })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });

  it("404 when the review does not exist", async () => {
    mocks.reviewFindUnique.mockResolvedValue(null);
    expect((await post({ action: "hide" })).status).toBe(404);
  });

  it("hide stamps status=hidden + moderation audit fields", async () => {
    const res = await post({ action: "hide" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "hidden" });
    const { where, data } = mocks.reviewUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "rev-1" });
    expect(data.status).toBe("hidden");
    expect(data.moderatedById).toBe("admin-1");
    expect(data.moderatedAt).toBeInstanceOf(Date);
  });

  it("restore flips a hidden review back to published", async () => {
    mocks.reviewFindUnique.mockResolvedValue({ ...publishedReview, status: "hidden" });
    const res = await post({ action: "restore" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "published" });
    expect(mocks.reviewUpdate.mock.calls[0][0].data.status).toBe("published");
  });

  it("409 when the review is already in the requested state", async () => {
    expect((await post({ action: "restore" })).status).toBe(409);
    mocks.reviewFindUnique.mockResolvedValue({ ...publishedReview, status: "hidden" });
    expect((await post({ action: "hide" })).status).toBe(409);
    expect(mocks.reviewUpdate).not.toHaveBeenCalled();
  });
});
