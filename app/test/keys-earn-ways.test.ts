// "Ways to earn Keys" surface (DOK-164): the catalogue carries the founder-set
// amounts, the identity-gate flag, and a per-user done/to-do state derived from
// the ledger. Runs against an in-memory fake of the @/lib/db surface.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WELCOME_BONUS_KEYS,
  EARN_PROPERTY_VERIFIED_KEYS,
  EARN_REVIEW_KEYS,
} from "@/lib/keys/config";

const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, { id: string; verified: boolean }>(),
    txns: [] as Array<{ userId: string; kind: string }>,
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
    },
    keysTransaction: {
      async groupBy({ where }: any) {
        const rows = store.txns.filter(
          (t) => t.userId === where.userId && where.kind.in.includes(t.kind),
        );
        const byKind = new Map<string, number>();
        for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
        return [...byKind].map(([kind, n]) => ({ kind, _count: { _all: n } }));
      },
    },
  };
  return { store, client };
});

const store = h.store;
vi.mock("@/lib/db", () => ({ prisma: h.client }));

import { earnWaysFor } from "@/lib/keys/earn-ways";

beforeEach(() => {
  store.users.clear();
  store.txns = [];
});

describe("earnWaysFor", () => {
  it("returns the catalogue with founder amounts and gate flags", async () => {
    store.users.set("u1", { id: "u1", verified: true });
    const payload = await earnWaysFor("u1");
    expect(payload.identityVerified).toBe(true);

    const byKey = Object.fromEntries(payload.ways.map((w) => [w.key, w]));
    expect(byKey.verify_identity.amount).toBe(WELCOME_BONUS_KEYS);
    expect(byKey.verify_identity.gatedOnIdentity).toBe(false);
    expect(byKey.verify_property.amount).toBe(EARN_PROPERTY_VERIFIED_KEYS);
    expect(byKey.verify_property.gatedOnIdentity).toBe(true);
    expect(byKey.leave_review.amount).toBe(EARN_REVIEW_KEYS);
    // Includes the referral way (DOK-157), not duplicated as a new kind.
    expect(byKey.refer_friend.kind).toBe("referral_bonus");
  });

  it("marks a way done once the user has earned that kind", async () => {
    store.users.set("u1", { id: "u1", verified: true });
    store.txns.push({ userId: "u1", kind: "earn_review" });
    const payload = await earnWaysFor("u1");
    const byKey = Object.fromEntries(payload.ways.map((w) => [w.key, w]));
    expect(byKey.leave_review.done).toBe(true);
    expect(byKey.verify_property.done).toBe(false);
  });

  it("reports identityVerified=false for an unverified user", async () => {
    store.users.set("u1", { id: "u1", verified: false });
    const payload = await earnWaysFor("u1");
    expect(payload.identityVerified).toBe(false);
  });
});
