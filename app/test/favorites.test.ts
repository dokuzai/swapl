// /api/favorites — auth gating, list shape, idempotent favorite/unfavorite,
// 404 on missing/inactive listings. Prisma + session are mocked so the route
// logic runs hermetically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  favoriteFindMany: vi.fn(),
  favoriteUpsert: vi.fn(),
  favoriteDeleteMany: vi.fn(),
  listingFindUnique: vi.fn(),
  swapReviewGroupBy: vi.fn(),
  toDTO: vi.fn((l: { id: string; userId: string; city: string }) => ({
    id: l.id,
    userId: l.userId,
    city: l.city,
  })),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    favorite: {
      findMany: mocks.favoriteFindMany,
      upsert: mocks.favoriteUpsert,
      deleteMany: mocks.favoriteDeleteMany,
    },
    listing: { findUnique: mocks.listingFindUnique },
    swapReview: { groupBy: mocks.swapReviewGroupBy },
  },
}));
vi.mock("@/lib/listing-utils", () => ({ toDTO: mocks.toDTO }));

import { GET as listFavorites } from "@/app/api/favorites/route";
import { GET as listIds } from "@/app/api/favorites/ids/route";
import { PUT, DELETE } from "@/app/api/favorites/[listingId]/route";

function put(listingId = "l-1") {
  return PUT(new Request(`https://swapl.test/api/favorites/${listingId}`, { method: "PUT" }), {
    params: Promise.resolve({ listingId }),
  });
}

function del(listingId = "l-1") {
  return DELETE(new Request(`https://swapl.test/api/favorites/${listingId}`, { method: "DELETE" }), {
    params: Promise.resolve({ listingId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.favoriteFindMany.mockResolvedValue([]);
  mocks.favoriteUpsert.mockResolvedValue({ id: "fav-1" });
  mocks.favoriteDeleteMany.mockResolvedValue({ count: 1 });
  mocks.listingFindUnique.mockResolvedValue({ id: "l-1", isActive: true });
  mocks.swapReviewGroupBy.mockResolvedValue([]);
});

describe("GET /api/favorites", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await listFavorites(new Request("https://swapl.test/api/favorites"));
    expect(res.status).toBe(401);
  });

  it("returns the user's favorited listings as DTOs, newest favorite first, active only", async () => {
    mocks.favoriteFindMany.mockResolvedValue([
      { listing: { id: "l-2", userId: "u-2", city: "Lisbon", user: { name: "Ben" } } },
      { listing: { id: "l-3", userId: "u-3", city: "Istanbul", user: { name: "Cem" } } },
    ]);
    const res = await listFavorites(new Request("https://swapl.test/api/favorites"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.map((i: { id: string }) => i.id)).toEqual(["l-2", "l-3"]);
    expect(mocks.favoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u-1", listing: { isActive: true } },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("GET /api/favorites/ids", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await listIds(new Request("https://swapl.test/api/favorites/ids"));
    expect(res.status).toBe(401);
  });

  it("returns just the listing ids", async () => {
    mocks.favoriteFindMany.mockResolvedValue([{ listingId: "l-2" }, { listingId: "l-3" }]);
    const res = await listIds(new Request("https://swapl.test/api/favorites/ids"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ids: ["l-2", "l-3"] });
  });
});

describe("PUT /api/favorites/[listingId]", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await put()).status).toBe(401);
    expect(mocks.favoriteUpsert).not.toHaveBeenCalled();
  });

  it("404s for a missing listing", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    expect((await put("l-missing")).status).toBe(404);
    expect(mocks.favoriteUpsert).not.toHaveBeenCalled();
  });

  it("404s for an inactive listing", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", isActive: false });
    expect((await put()).status).toBe(404);
    expect(mocks.favoriteUpsert).not.toHaveBeenCalled();
  });

  it("favorites idempotently via upsert", async () => {
    const res = await put();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, favorited: true });
    expect(mocks.favoriteUpsert).toHaveBeenCalledWith({
      where: { userId_listingId: { userId: "u-1", listingId: "l-1" } },
      create: { userId: "u-1", listingId: "l-1" },
      update: {},
    });
    // A second call is the same no-op success.
    expect((await put()).status).toBe(200);
  });
});

describe("DELETE /api/favorites/[listingId]", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
    expect(mocks.favoriteDeleteMany).not.toHaveBeenCalled();
  });

  it("unfavorites and is idempotent when nothing was favorited", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, favorited: false });
    expect(mocks.favoriteDeleteMany).toHaveBeenCalledWith({
      where: { userId: "u-1", listingId: "l-1" },
    });

    mocks.favoriteDeleteMany.mockResolvedValue({ count: 0 });
    const res2 = await del();
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true, favorited: false });
  });
});
