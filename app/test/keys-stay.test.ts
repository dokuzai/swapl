// Stay-with-Keys (DOK-155): hold on request, confirm → spend+earn+policy,
// decline → release, conflict + insufficient-Keys guards. Uses an in-memory
// Prisma fake + a mocked insurance provider.
//
// The fake mirrors Prisma's loosely-typed query args, so `any` is used freely
// here for the test double.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";

type StayRow = {
  id: string;
  listingId: string;
  guestId: string;
  hostId: string;
  dateFrom: Date;
  dateTo: Date;
  nights: number;
  keysCost: number;
  status: string;
  insurancePolicyId: string | null;
  createdAt: Date;
};
type TxRow = { id: string; userId: string; delta: number; kind: string; balanceAfter: number; stayId: string | null; note: string | null; createdAt: Date };

const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, any>(),
    listings: new Map<string, any>(),
    stays: new Map<string, any>(),
    occupancies: new Map<string, any>(),
    txns: [] as any[],
    seq: 0,
  };
  function pick(row: any, select?: Record<string, boolean | object>) {
    if (!select) return { ...row };
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(select)) out[k] = row[k];
    return out;
  }
  const client: any = {
    user: {
      async findUnique({ where, select }: any) {
        const u = store.users.get(where.id);
        return u ? pick(u, select) : null;
      },
      async update({ where, data }: any) {
        const u = store.users.get(where.id)!;
        // Simulate Prisma atomic ops so balance math (hold/spend/earn/release) works.
        for (const [k, v] of Object.entries<any>(data)) {
          if (v && typeof v === "object" && "increment" in v) u[k] = (u[k] ?? 0) + v.increment;
          else if (v && typeof v === "object" && "decrement" in v) u[k] = (u[k] ?? 0) - v.decrement;
          else u[k] = v;
        }
        return { ...u };
      },
    },
    listing: {
      async findUnique({ where, select }: any) {
        const l = store.listings.get(where.id);
        return l ? pick(l, select) : null;
      },
    },
    keysStay: {
      async create({ data }: any) {
        const row: StayRow = { id: `stay_${++store.seq}`, insurancePolicyId: null, createdAt: new Date(), ...data };
        store.stays.set(row.id, row);
        return { ...row };
      },
      async findUnique({ where, select, include }: any) {
        const s = store.stays.get(where.id);
        if (!s) return null;
        if (include) {
          const out: any = { ...s };
          if (include.listing) out.listing = pick(store.listings.get(s.listingId)!, include.listing.select);
          if (include.guest) out.guest = pick(store.users.get(s.guestId)!, include.guest.select);
          if (include.host) out.host = pick(store.users.get(s.hostId)!, include.host.select);
          return out;
        }
        return pick(s, select);
      },
      async findMany({ where, select }: any) {
        let rows = [...store.stays.values()];
        if (where?.listingId) rows = rows.filter((r) => r.listingId === where.listingId);
        if (where?.status?.in) rows = rows.filter((r) => where.status.in.includes(r.status));
        return rows.map((r) => pick(r, select));
      },
      async update({ where, data }: any) {
        const s = store.stays.get(where.id)!;
        Object.assign(s, data);
        return { ...s };
      },
    },
    keysTransaction: {
      async create({ data }: any) {
        const row: TxRow = { id: `tx_${++store.seq}`, createdAt: new Date(), ...data };
        store.txns.push(row);
        return { ...row };
      },
    },
    // DOK-159: bookedRangesFor() reads these. No agreements/blocks are seeded
    // in these tests, so empty results keep the existing scenarios intact.
    swapAgreement: {
      async findMany() {
        return [];
      },
    },
    listingBlockedRange: {
      async findMany() {
        return [];
      },
    },
    listingOccupancy: {
      async create({ data }: any) {
        const row = { id: `occ_${++store.seq}`, createdAt: new Date(), ...data };
        store.occupancies.set(row.id, row);
        return { ...row };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [id, row] of [...store.occupancies]) {
          if (where?.source && row.source !== where.source) continue;
          if (where?.sourceId && row.sourceId !== where.sourceId) continue;
          if (where?.listingId && row.listingId !== where.listingId) continue;
          store.occupancies.delete(id);
          count++;
        }
        return { count };
      },
    },
    // Model Prisma's atomicity: snapshot the store, run the callback, and on
    // throw restore the snapshot so a failed transaction leaves no partial write.
    async $transaction(fn: any) {
      const snap = {
        users: new Map([...store.users].map(([k, v]) => [k, { ...v }])),
        listings: new Map([...store.listings].map(([k, v]) => [k, { ...v }])),
        stays: new Map([...store.stays].map(([k, v]) => [k, { ...v }])),
        occupancies: new Map([...store.occupancies].map(([k, v]) => [k, { ...v }])),
        txns: store.txns.map((t) => ({ ...t })),
        seq: store.seq,
      };
      try {
        return await fn(client);
      } catch (err) {
        store.users = snap.users;
        store.listings = snap.listings;
        store.stays = snap.stays;
        store.occupancies = snap.occupancies;
        store.txns = snap.txns;
        store.seq = snap.seq;
        throw err;
      }
    },
  };
  return { store, client };
});

const store = h.store;
vi.mock("@/lib/db", () => ({ prisma: h.client }));
vi.mock("@/lib/insurance", () => ({
  insuranceProvider: () => ({
    name: "mock",
    async createPolicy() {
      return { policyNumber: "SC-2026-000001", externalId: "ext_123", premiumCents: 0, platformShareCents: 0, coverageAmount: 150000, expiresAt: new Date(), documentsUrl: null };
    },
  }),
}));

import { confirmKeysStay, createKeysStay, releaseKeysStay } from "@/lib/keys/stay";

function seed() {
  store.users.set("host", { id: "host", name: "Host", email: "host@swapl.test", keysBalance: 0 });
  store.users.set("guest", { id: "guest", name: "Guest", email: "guest@swapl.test", keysBalance: 100 });
  store.listings.set("L1", {
    id: "L1",
    userId: "host",
    isActive: true,
    sizeSqm: 60,
    sleeps: 4,
    city: "Lisbon",
    neighbourhood: "Alfama",
    country: "Portugal",
    address: null,
    isVerified: true,
    availableFrom: new Date("2026-07-01"),
    availableTo: new Date("2026-08-31"),
    minStayDays: 3,
    maxStayDays: 30,
  });
}

beforeEach(() => {
  store.users.clear();
  store.listings.clear();
  store.stays.clear();
  store.occupancies.clear();
  store.txns = [];
  store.seq = 0;
  seed();
});

const from = new Date("2026-07-10");
const to = new Date("2026-07-17"); // 7 nights

describe("createKeysStay", () => {
  it("holds the guest's Keys and creates a pending stay", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    // nightly = capacity (sleeps 4) = 4; ×7 nights = 28 (DOK-219)
    expect(stay.nights).toBe(7);
    expect(stay.keysCost).toBe(28);
    expect(store.users.get("guest")!.keysBalance).toBe(72); // 100 - 28 held
    expect(store.txns.filter((t) => t.kind === "hold")).toHaveLength(1);
    expect(store.stays.get(stay.id)!.status).toBe("pending");
    expect([...store.occupancies.values()]).toEqual([
      expect.objectContaining({ listingId: "L1", source: "keys_stay", sourceId: stay.id, dateFrom: from, dateTo: to }),
    ]);
  });

  it("rejects booking your own listing", async () => {
    await expect(
      createKeysStay({ listingId: "L1", guestId: "host", dateFrom: from, dateTo: to }),
    ).rejects.toMatchObject({ code: "OWN_LISTING" });
  });

  it("rejects overlapping dates", async () => {
    await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    await expect(
      createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: new Date("2026-07-12"), dateTo: new Date("2026-07-20") }),
    ).rejects.toMatchObject({ code: "DATES_TAKEN" });
  });

  it("rejects dates outside the availability window", async () => {
    await expect(
      createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: new Date("2026-09-10"), dateTo: new Date("2026-09-15") }),
    ).rejects.toMatchObject({ code: "OUTSIDE_AVAILABILITY" });
  });

  it("rejects when the guest can't afford the hold", async () => {
    store.users.get("guest")!.keysBalance = 10;
    await expect(
      createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to }),
    ).rejects.toMatchObject({ code: "NEGATIVE_BALANCE" });
    // No orphan stay left behind.
    expect(store.stays.size).toBe(0);
    expect(store.occupancies.size).toBe(0);
  });
});

describe("confirmKeysStay", () => {
  it("turns the hold into spend (guest) + earn (host) and issues a policy", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    const res = await confirmKeysStay(stay.id, "host");
    expect(res.keysCost).toBe(28);
    expect(store.users.get("guest")!.keysBalance).toBe(72); // net -28
    expect(store.users.get("host")!.keysBalance).toBe(28);
    const fresh = store.stays.get(stay.id)!;
    expect(fresh.status).toBe("confirmed");
    expect(fresh.insurancePolicyId).toBe("ext_123");
    expect(store.txns.some((t) => t.kind === "spend_stay")).toBe(true);
    expect(store.txns.some((t) => t.kind === "earn_host")).toBe(true);
  });

  it("only the host may confirm", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    await expect(confirmKeysStay(stay.id, "guest")).rejects.toMatchObject({ code: "NOT_HOST" });
  });

  it("cannot confirm twice", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    await confirmKeysStay(stay.id, "host");
    await expect(confirmKeysStay(stay.id, "host")).rejects.toMatchObject({ code: "BAD_STATE" });
  });
});

describe("releaseKeysStay", () => {
  it("decline releases the held Keys back to the guest", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    expect(store.users.get("guest")!.keysBalance).toBe(72);
    await releaseKeysStay(stay.id, "host", "declined");
    expect(store.users.get("guest")!.keysBalance).toBe(100);
    expect(store.stays.get(stay.id)!.status).toBe("declined");
    expect(store.occupancies.size).toBe(0);
    expect(store.users.get("host")!.keysBalance).toBe(0); // host never earned
  });

  it("cancel (guest) releases the hold", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    await releaseKeysStay(stay.id, "guest", "cancelled");
    expect(store.users.get("guest")!.keysBalance).toBe(100);
    expect(store.stays.get(stay.id)!.status).toBe("cancelled");
    expect(store.occupancies.size).toBe(0);
  });

  it("a guest cannot decline; a host cannot cancel", async () => {
    const stay = await createKeysStay({ listingId: "L1", guestId: "guest", dateFrom: from, dateTo: to });
    await expect(releaseKeysStay(stay.id, "guest", "declined")).rejects.toMatchObject({ code: "NOT_HOST" });
    await expect(releaseKeysStay(stay.id, "host", "cancelled")).rejects.toMatchObject({ code: "NOT_GUEST" });
  });
});
