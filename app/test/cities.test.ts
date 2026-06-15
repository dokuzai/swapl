// GET /api/cities — city autocomplete: active-only grouping, case-insensitive
// prefix filter, count-desc ordering, 20-item cap. Prisma groupBy is mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { listing: { groupBy: mocks.groupBy } },
}));

import { GET } from "@/app/api/cities/route";

function get(q?: string) {
  const url = new URL("https://swapl.test/api/cities");
  if (q !== undefined) url.searchParams.set("q", q);
  return GET(new Request(url));
}

const groups = [
  { city: "Istanbul", country: "Türkiye", _count: { _all: 7 } },
  { city: "Lisbon", country: "Portugal", _count: { _all: 12 } },
  { city: "Isfahan", country: "Iran", _count: { _all: 2 } },
  { city: "Berlin", country: "Germany", _count: { _all: 12 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.groupBy.mockResolvedValue(groups);
});

describe("GET /api/cities", () => {
  it("groups only active listings", async () => {
    await get();
    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, ineligibleReason: null } })
    );
  });

  it("returns all cities ordered by listing count desc (city asc tiebreak) without q", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([
      { city: "Berlin", country: "Germany", listings: 12 },
      { city: "Lisbon", country: "Portugal", listings: 12 },
      { city: "Istanbul", country: "Türkiye", listings: 7 },
      { city: "Isfahan", country: "Iran", listings: 2 },
    ]);
  });

  it("prefix-filters case-insensitively on q", async () => {
    const json = await (await get("isT")).json();
    expect(json.items).toEqual([{ city: "Istanbul", country: "Türkiye", listings: 7 }]);

    const broader = await (await get("is")).json();
    expect(broader.items.map((i: { city: string }) => i.city)).toEqual(["Istanbul", "Isfahan"]);
  });

  it("returns an empty list when nothing matches", async () => {
    const json = await (await get("zzz")).json();
    expect(json.items).toEqual([]);
  });

  it("caps the result at 20 items", async () => {
    mocks.groupBy.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        city: `City ${i}`,
        country: "X",
        _count: { _all: 30 - i },
      }))
    );
    const json = await (await get()).json();
    expect(json.items).toHaveLength(20);
    expect(json.items[0].listings).toBe(30);
  });
});
