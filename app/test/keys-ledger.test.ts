// Keys credit ledger (DOK-155): atomicity, no-negative-balance, gift caps +
// verified-only, welcome-bonus idempotency. Runs against an in-memory fake of
// the Prisma surface the ledger uses (matching the repo's @/lib/db mock style),
// so the balance/ledger invariants are exercised without a real database.
//
// The fake mirrors Prisma's loosely-typed query args, so `any` is used freely
// here for the test double.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory store + fake prisma ----
type UserRow = { id: string; keysBalance: number; verified: boolean; suspendedAt: Date | null };
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

// Everything the @/lib/db mock factory touches must be created inside
// vi.hoisted (the factory is hoisted above module-scope consts).
const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, UserRow>(),
    txns: [] as TxRow[],
    seq: 0,
  };
  // Mirror Prisma's atomic update operators so `{ keysBalance: { increment } }`
  // mutates the stored scalar instead of overwriting it with the operator object.
  function applyData(row: Record<string, any>, data: Record<string, any>) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("increment" in v) row[k] = (row[k] ?? 0) + v.increment;
        else if ("decrement" in v) row[k] = (row[k] ?? 0) - v.decrement;
        else if ("set" in v) row[k] = v.set;
        else row[k] = v;
      } else row[k] = v;
    }
    return row;
  }
  const client: any = {
    user: {
      async findUnique({ where, select }: any) {
        const u = store.users.get(where.id);
        if (!u) return null;
        if (!select) return { ...u };
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = (u as Record<string, unknown>)[k];
        return out;
      },
      async update({ where, data }: any) {
        const u = store.users.get(where.id)!;
        applyData(u, data);
        return { ...u };
      },
    },
    keysTransaction: {
      async create({ data }: any) {
        // Enforce the eventKey @unique constraint like the DB so idempotency
        // (welcome bonus, earn hooks) is actually exercised, not just assumed.
        if (data.eventKey && store.txns.some((t) => t.eventKey === data.eventKey)) {
          const err: any = new Error("Unique constraint failed on eventKey");
          err.code = "P2002";
          throw err;
        }
        const row: TxRow = { id: `tx_${++store.seq}`, createdAt: new Date(), eventKey: null, ...data };
        store.txns.push(row);
        return { ...row };
      },
      async findFirst({ where }: any) {
        return store.txns.find((t) => t.userId === where.userId && t.kind === where.kind) ?? null;
      },
      async aggregate({ where }: any) {
        const sum = store.txns.filter((t) => t.userId === where.userId).reduce((acc, t) => acc + t.delta, 0);
        return { _sum: { delta: sum } };
      },
    },
    async $transaction(fn: any) {
      // Emulate rollback: the real ledger increments then throws NEGATIVE_BALANCE,
      // relying on the tx to undo the write. Snapshot and restore on throw.
      const snapUsers = new Map([...store.users].map(([k, v]) => [k, { ...v }]));
      const snapLen = store.txns.length;
      try {
        return await fn(client);
      } catch (err) {
        store.users = snapUsers;
        store.txns.length = snapLen;
        throw err;
      }
    },
  };
  return { store, client };
});

const store = h.store;
vi.mock("@/lib/db", () => ({ prisma: h.client }));

import {
  applyTransaction,
  earn,
  gift,
  grantWelcomeBonus,
  hold,
  KeysLedgerError,
  recomputeBalance,
  release,
  spend,
} from "@/lib/keys/ledger";

function seedUser(id: string, opts: Partial<UserRow> = {}) {
  store.users.set(id, { id, keysBalance: 0, verified: true, suspendedAt: null, ...opts });
}

beforeEach(() => {
  store.users.clear();
  store.txns = [];
  store.seq = 0;
});

describe("applyTransaction", () => {
  it("appends a ledger row and keeps balanceAfter == cached balance", async () => {
    seedUser("u1", { keysBalance: 0 });
    const row = await applyTransaction({ userId: "u1", delta: 30, kind: "welcome_bonus" });
    expect(row.balanceAfter).toBe(30);
    expect(store.users.get("u1")!.keysBalance).toBe(30);
    expect(store.txns).toHaveLength(1);
  });

  it("rejects a debit that would make the balance negative", async () => {
    seedUser("u1", { keysBalance: 10 });
    await expect(spend("u1", 25, {})).rejects.toMatchObject({ code: "NEGATIVE_BALANCE" });
    // No partial write: balance and ledger unchanged.
    expect(store.users.get("u1")!.keysBalance).toBe(10);
    expect(store.txns).toHaveLength(0);
  });

  it("rejects non-positive amounts in the helpers", () => {
    seedUser("u1", { keysBalance: 10 });
    // assertPositive throws synchronously, before the ledger promise is created.
    expect(() => earn("u1", 0, {})).toThrow(KeysLedgerError);
    expect(() => earn("u1", -5, {})).toThrow(KeysLedgerError);
  });
});

describe("hold / release / spend / earn", () => {
  it("hold then release nets to zero for the guest", async () => {
    seedUser("guest", { keysBalance: 100 });
    await hold("guest", 40, {});
    expect(store.users.get("guest")!.keysBalance).toBe(60);
    await release("guest", 40, {});
    expect(store.users.get("guest")!.keysBalance).toBe(100);
  });

  it("confirm-style flow: release + spend (guest) and earn (host)", async () => {
    seedUser("guest", { keysBalance: 100 });
    seedUser("host", { keysBalance: 0 });
    await hold("guest", 40, {}); // at request
    // at confirm:
    await release("guest", 40, {});
    await spend("guest", 40, {});
    await earn("host", 40, {});
    expect(store.users.get("guest")!.keysBalance).toBe(60); // net -40
    expect(store.users.get("host")!.keysBalance).toBe(40);
  });
});

describe("gift", () => {
  it("moves Keys from sender to recipient atomically", async () => {
    seedUser("a", { keysBalance: 50 });
    seedUser("b", { keysBalance: 0 });
    const { sent, received } = await gift("a", "b", 20);
    expect(sent.balanceAfter).toBe(30);
    expect(received.balanceAfter).toBe(20);
    expect(store.users.get("a")!.keysBalance).toBe(30);
    expect(store.users.get("b")!.keysBalance).toBe(20);
  });

  it("refuses to overdraw the sender", async () => {
    seedUser("a", { keysBalance: 5 });
    seedUser("b", { keysBalance: 0 });
    await expect(gift("a", "b", 20)).rejects.toMatchObject({ code: "NEGATIVE_BALANCE" });
  });
});

describe("grantWelcomeBonus", () => {
  it("grants once and is a no-op on replay (idempotent)", async () => {
    seedUser("u1", { keysBalance: 0 });
    const first = await grantWelcomeBonus("u1", 30);
    expect(first?.balanceAfter).toBe(30);
    const second = await grantWelcomeBonus("u1", 30);
    expect(second).toBeNull();
    expect(store.users.get("u1")!.keysBalance).toBe(30);
    expect(store.txns.filter((t) => t.kind === "welcome_bonus")).toHaveLength(1);
  });

  it("stamps a deterministic eventKey so a concurrent grant can't double-credit", async () => {
    seedUser("u2", { keysBalance: 0 });
    await grantWelcomeBonus("u2", 30);
    const row = store.txns.find((t) => t.kind === "welcome_bonus");
    expect(row?.eventKey).toBe("welcome_bonus:u2");
    // A second insert with the same eventKey is refused by the unique guard,
    // so grantWelcomeBonus swallows P2002 and returns null (no double-credit).
    await expect(grantWelcomeBonus("u2", 30)).resolves.toBeNull();
    expect(store.users.get("u2")!.keysBalance).toBe(30);
  });
});

describe("recomputeBalance", () => {
  it("rebuilds the cached balance from the ledger sum", async () => {
    seedUser("u1", { keysBalance: 0 });
    await earn("u1", 30, {});
    await spend("u1", 10, {});
    // Corrupt the cache, then repair.
    store.users.get("u1")!.keysBalance = 999;
    const fixed = await recomputeBalance("u1");
    expect(fixed).toBe(20);
    expect(store.users.get("u1")!.keysBalance).toBe(20);
  });
});
