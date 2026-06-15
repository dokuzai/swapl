// Keys earning hooks (DOK-164): idempotency (one ledger row per event), the
// identity gate (unverified → no bonus), the rolling caps, correct founder-set
// amounts, and no double-credit with referrals. Runs against an in-memory fake
// of the Prisma surface the earn lib + ledger touch (repo @/lib/db mock style),
// no real database.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EARN_PROPERTY_VERIFIED_KEYS,
  EARN_REVIEW_KEYS,
  EARN_SHARE_CONVERTED_KEYS,
  EARN_LISTING_COMPLETE_KEYS,
  EARN_REVIEW_CAP,
} from "@/lib/keys/config";

type UserRow = { id: string; keysBalance: number; verified: boolean };
type TxRow = {
  id: string;
  userId: string;
  delta: number;
  kind: string;
  balanceAfter: number;
  stayId: string | null;
  note: string | null;
  eventKey: string | null;
  createdAt: Date;
};
type ListingRow = {
  id: string;
  userId: string;
  isActive: boolean;
  ownerVerified: boolean;
  homeGuide: Record<string, string | null> | null;
};
type ShareRow = {
  id: string;
  listingId: string;
  sharerId: string;
  token: string;
  convertedById: string | null;
  conversionRef: string | null;
  convertedAt: Date | null;
  keysAwardedAt: Date | null;
  createdAt: Date;
};

const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, UserRow>(),
    txns: [] as TxRow[],
    listings: new Map<string, ListingRow>(),
    shares: [] as ShareRow[],
    seq: 0,
  };
  const matches = (row: any, where: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (v && typeof v === "object" && "gte" in (v as any)) {
        if (!(row[k] >= (v as any).gte)) return false;
      } else if (v && typeof v === "object" && "in" in (v as any)) {
        if (!(v as any).in.includes(row[k])) return false;
      } else if (row[k] !== v) {
        return false;
      }
    }
    return true;
  };
  const client: any = {
    user: {
      async findUnique({ where, select }: any) {
        const u = store.users.get(where.id);
        if (!u) return null;
        if (!select) return { ...u };
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (u as any)[k];
        return out;
      },
      async update({ where, data }: any) {
        const u = store.users.get(where.id)!;
        Object.assign(u, data);
        return { ...u };
      },
    },
    keysTransaction: {
      async create({ data }: any) {
        // Enforce the unique eventKey constraint like the DB would.
        if (data.eventKey && store.txns.some((t) => t.eventKey === data.eventKey)) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const row: TxRow = {
          id: `tx_${++store.seq}`,
          createdAt: new Date(),
          stayId: null,
          note: null,
          eventKey: null,
          ...data,
        };
        store.txns.push(row);
        return { ...row };
      },
      async findUnique({ where }: any) {
        if (where.eventKey !== undefined) {
          return store.txns.find((t) => t.eventKey === where.eventKey) ?? null;
        }
        return store.txns.find((t) => t.id === where.id) ?? null;
      },
      async findFirst({ where }: any) {
        return store.txns.find((t) => matches(t, where)) ?? null;
      },
      async count({ where }: any) {
        return store.txns.filter((t) => matches(t, where)).length;
      },
      async groupBy({ where }: any) {
        const rows = store.txns.filter((t) => matches(t, where));
        const byKind = new Map<string, number>();
        for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
        return [...byKind].map(([kind, n]) => ({ kind, _count: { _all: n } }));
      },
    },
    listing: {
      async findUnique({ where, select }: any) {
        const l = store.listings.get(where.id);
        if (!l) return null;
        if (!select) return { ...l };
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (l as any)[k];
        return out;
      },
    },
    listingShareAttribution: {
      async findUnique({ where, select }: any) {
        const row = where.token
          ? store.shares.find((s) => s.token === where.token)
          : where.listingId_sharerId
            ? store.shares.find(
                (s) =>
                  s.listingId === where.listingId_sharerId.listingId &&
                  s.sharerId === where.listingId_sharerId.sharerId,
              )
            : store.shares.find((s) => s.id === where.id);
        if (!row) return null;
        if (!select) return { ...row };
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (row as any)[k];
        return out;
      },
      async update({ where, data }: any) {
        const row = store.shares.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      async create({ data }: any) {
        const row: ShareRow = {
          id: `sh_${++store.seq}`,
          convertedById: null,
          conversionRef: null,
          convertedAt: null,
          keysAwardedAt: null,
          createdAt: new Date(),
          ...data,
        };
        store.shares.push(row);
        return { ...row };
      },
    },
    async $transaction(fn: any) {
      return fn(client);
    },
  };
  return { store, client };
});

const store = h.store;
vi.mock("@/lib/db", () => ({ prisma: h.client }));

import {
  grantPropertyVerifiedBonus,
  grantReviewBonus,
  grantShareConvertedBonus,
  maybeGrantListingCompleteBonus,
} from "@/lib/keys/earn";

const COMPLETE_GUIDE = {
  accessInstructions: "x",
  keyPickup: "x",
  wifiName: "x",
  wifiPassword: "x",
  heatingCooling: "x",
  kitchen: "x",
  bins: "x",
  petsPlants: "x",
};

function seedUser(id: string, verified = true, keysBalance = 0) {
  store.users.set(id, { id, keysBalance, verified });
}
function balance(id: string) {
  return store.users.get(id)?.keysBalance ?? 0;
}

beforeEach(() => {
  store.users.clear();
  store.txns = [];
  store.listings.clear();
  store.shares = [];
  store.seq = 0;
});

describe("grantPropertyVerifiedBonus", () => {
  it("credits +15 once, idempotent on replay", async () => {
    seedUser("owner");
    const r1 = await grantPropertyVerifiedBonus({ userId: "owner", listingId: "L1" });
    expect(r1).toMatchObject({ credited: true, amount: EARN_PROPERTY_VERIFIED_KEYS });
    expect(balance("owner")).toBe(EARN_PROPERTY_VERIFIED_KEYS);

    const r2 = await grantPropertyVerifiedBonus({ userId: "owner", listingId: "L1" });
    expect(r2).toMatchObject({ credited: false, reason: "duplicate" });
    expect(balance("owner")).toBe(EARN_PROPERTY_VERIFIED_KEYS);
    expect(store.txns.filter((t) => t.kind === "earn_property_verified")).toHaveLength(1);
  });

  it("does NOT credit an unverified user (identity gate)", async () => {
    seedUser("owner", false);
    const r = await grantPropertyVerifiedBonus({ userId: "owner", listingId: "L1" });
    expect(r).toMatchObject({ credited: false, reason: "unverified" });
    expect(balance("owner")).toBe(0);
  });
});

describe("grantReviewBonus", () => {
  it("credits +5 per review, idempotent per reviewId", async () => {
    seedUser("author");
    const a = await grantReviewBonus({ authorId: "author", reviewId: "rev1" });
    expect(a).toMatchObject({ credited: true, amount: EARN_REVIEW_KEYS });
    const b = await grantReviewBonus({ authorId: "author", reviewId: "rev1" });
    expect(b).toMatchObject({ credited: false, reason: "duplicate" });
    const c = await grantReviewBonus({ authorId: "author", reviewId: "rev2" });
    expect(c).toMatchObject({ credited: true });
    expect(balance("author")).toBe(EARN_REVIEW_KEYS * 2);
  });

  it("stops minting past the rolling cap (action still succeeds)", async () => {
    seedUser("author");
    for (let i = 0; i < EARN_REVIEW_CAP; i++) {
      const r = await grantReviewBonus({ authorId: "author", reviewId: `rev${i}` });
      expect(r.credited).toBe(true);
    }
    const over = await grantReviewBonus({ authorId: "author", reviewId: "rev-over" });
    expect(over).toMatchObject({ credited: false, reason: "capped" });
    expect(balance("author")).toBe(EARN_REVIEW_KEYS * EARN_REVIEW_CAP);
  });
});

describe("maybeGrantListingCompleteBonus", () => {
  it("credits +5 only when active + ownerVerified + complete guide", async () => {
    seedUser("owner");
    store.listings.set("L1", {
      id: "L1",
      userId: "owner",
      isActive: true,
      ownerVerified: false,
      homeGuide: COMPLETE_GUIDE,
    });
    // Not owner-verified yet → no credit.
    expect(await maybeGrantListingCompleteBonus("L1")).toMatchObject({
      credited: false,
      reason: "not_eligible",
    });

    store.listings.get("L1")!.ownerVerified = true;
    const ok = await maybeGrantListingCompleteBonus("L1");
    expect(ok).toMatchObject({ credited: true, amount: EARN_LISTING_COMPLETE_KEYS });

    // Idempotent: a second trigger (e.g. guide re-saved) mints nothing.
    expect(await maybeGrantListingCompleteBonus("L1")).toMatchObject({
      credited: false,
      reason: "duplicate",
    });
    expect(balance("owner")).toBe(EARN_LISTING_COMPLETE_KEYS);
  });

  it("does not credit an incomplete guide", async () => {
    seedUser("owner");
    store.listings.set("L2", {
      id: "L2",
      userId: "owner",
      isActive: true,
      ownerVerified: true,
      homeGuide: { ...COMPLETE_GUIDE, kitchen: null },
    });
    expect(await maybeGrantListingCompleteBonus("L2")).toMatchObject({
      credited: false,
      reason: "not_eligible",
    });
  });
});

describe("grantShareConvertedBonus", () => {
  function seedShare(over: Partial<ShareRow> = {}) {
    const row: ShareRow = {
      id: "sh1",
      listingId: "L1",
      sharerId: "sharer",
      token: "tok",
      convertedById: null,
      conversionRef: null,
      convertedAt: null,
      keysAwardedAt: null,
      createdAt: new Date(),
      ...over,
    };
    store.shares.push(row);
    return row;
  }

  it("credits the sharer +15 once and stamps the award guard", async () => {
    seedUser("sharer");
    seedShare();
    const r = await grantShareConvertedBonus({
      attributionId: "sh1",
      converterId: "guest",
      conversionRef: "stay1",
    });
    expect(r).toMatchObject({ credited: true, amount: EARN_SHARE_CONVERTED_KEYS });
    expect(balance("sharer")).toBe(EARN_SHARE_CONVERTED_KEYS);
    expect(store.shares[0].keysAwardedAt).not.toBeNull();

    // Replay → no double credit (already awarded).
    const again = await grantShareConvertedBonus({
      attributionId: "sh1",
      converterId: "guest",
      conversionRef: "stay1",
    });
    expect(again).toMatchObject({ credited: false, reason: "already_converted" });
    expect(balance("sharer")).toBe(EARN_SHARE_CONVERTED_KEYS);
  });

  it("never pays a sharer for their own booking", async () => {
    seedUser("sharer");
    seedShare();
    const r = await grantShareConvertedBonus({
      attributionId: "sh1",
      converterId: "sharer",
      conversionRef: "stay1",
    });
    expect(r).toMatchObject({ credited: false, reason: "self" });
    expect(balance("sharer")).toBe(0);
  });

  it("gates an unverified sharer", async () => {
    seedUser("sharer", false);
    seedShare();
    const r = await grantShareConvertedBonus({
      attributionId: "sh1",
      converterId: "guest",
      conversionRef: "stay1",
    });
    expect(r).toMatchObject({ credited: false, reason: "unverified" });
    expect(balance("sharer")).toBe(0);
  });
});

describe("no double-credit with referrals", () => {
  it("earn_* kinds are distinct from referral_bonus / invite_bonus", async () => {
    seedUser("u1");
    await grantReviewBonus({ authorId: "u1", reviewId: "r1" });
    await grantPropertyVerifiedBonus({ userId: "u1", listingId: "L1" });
    const kinds = store.txns.map((t) => t.kind);
    expect(kinds).not.toContain("referral_bonus");
    expect(kinds).not.toContain("invite_bonus");
    expect(new Set(kinds)).toEqual(new Set(["earn_review", "earn_property_verified"]));
  });
});
