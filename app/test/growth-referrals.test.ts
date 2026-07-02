// Growth engine core (DOK-157): referral-code uniqueness, signup attribution,
// invite-to-stay linking, and the qualification hook — two-sided Keys credit
// exactly once, under the referrer's daily cap, idempotent on replay. Runs
// against an in-memory fake of the Prisma surface the growth lib + ledger use
// (matching the repo's @/lib/db mock style), no real database.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_REWARD_KEYS, REFERRAL_REFEREE_KEYS, REFERRAL_DAILY_CAP } from "@/lib/growth/config";

type UserRow = { id: string; keysBalance: number; referralCode: string | null; name?: string | null };
type ReferralRow = {
  id: string;
  ownerId: string;
  refereeId: string | null;
  refereeEmail: string | null;
  source: string;
  listingId: string | null;
  token: string | null;
  status: string;
  rewardedAt: Date | null;
  createdAt: Date;
  qualifiedAt: Date | null;
  ownerNotifiedAt: Date | null;
};
type TxRow = {
  id: string;
  userId: string;
  delta: number;
  kind: string;
  balanceAfter: number;
  stayId: string | null;
  note: string | null;
  createdAt: Date;
};

const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, UserRow>(),
    referrals: [] as ReferralRow[],
    txns: [] as TxRow[],
    seq: 0,
  };
  const id = (p: string) => `${p}_${++store.seq}`;

  const pick = (row: any, select: any) => {
    if (!select) return { ...row };
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(select)) {
      if (select[k] && typeof select[k] === "object" && "select" in select[k]) {
        // nested relation (referee)
        out[k] = row[k] ?? null;
      } else if (select[k]) {
        out[k] = row[k];
      }
    }
    return out;
  };

  const matchWhere = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const key of Object.keys(where)) {
      const cond = where[key];
      if (cond === null) {
        if (row[key] !== null && row[key] !== undefined) return false;
      } else if (cond && typeof cond === "object" && ("gte" in cond || "in" in cond)) {
        if ("gte" in cond && !(row[key] && row[key] >= cond.gte)) return false;
        if ("in" in cond && !cond.in.includes(row[key])) return false;
      } else if (row[key] !== cond) {
        return false;
      }
    }
    return true;
  };

  const client: any = {
    user: {
      async findUnique({ where, select }: any) {
        let u: UserRow | undefined;
        if (where.id) u = store.users.get(where.id);
        else if (where.referralCode)
          u = [...store.users.values()].find((x) => x.referralCode === where.referralCode);
        if (!u) return null;
        return pick(u, select);
      },
      async update({ where, data, select }: any) {
        const u = store.users.get(where.id);
        if (!u) throw new Error("user not found");
        if (data.referralCode !== undefined) {
          const clash = [...store.users.values()].find(
            (x) => x.id !== u.id && x.referralCode === data.referralCode,
          );
          if (clash) throw new Error("unique referralCode");
          u.referralCode = data.referralCode;
        }
        if (data.keysBalance !== undefined) {
          // Support Prisma's atomic { increment } operator, not just a scalar set.
          const kb = data.keysBalance;
          if (kb && typeof kb === "object") {
            if ("increment" in kb) u.keysBalance = (u.keysBalance ?? 0) + kb.increment;
            else if ("decrement" in kb) u.keysBalance = (u.keysBalance ?? 0) - kb.decrement;
            else if ("set" in kb) u.keysBalance = kb.set;
          } else {
            u.keysBalance = kb;
          }
        }
        return pick(u, select);
      },
    },
    referral: {
      async findUnique({ where, select }: any) {
        let r: ReferralRow | undefined;
        if (where.id) r = store.referrals.find((x) => x.id === where.id);
        else if ("refereeId" in where)
          r = store.referrals.find((x) => x.refereeId === where.refereeId);
        else if (where.token) r = store.referrals.find((x) => x.token === where.token);
        if (!r) return null;
        return pick(r, select);
      },
      async findFirst({ where, select, include }: any) {
        const r = store.referrals.find((x) => matchWhere(x, where));
        if (!r) return null;
        if (include?.owner) {
          const owner = store.users.get(r.ownerId) ?? null;
          return { ...r, owner: owner ? pick(owner, include.owner.select) : null };
        }
        return pick(r, select);
      },
      async findMany({ where, select, include, orderBy }: any) {
        let rows = store.referrals.filter((x) => matchWhere(x, where));
        if (orderBy?.rewardedAt === "desc") {
          rows = [...rows].sort(
            (a, b) => (b.rewardedAt?.getTime() ?? 0) - (a.rewardedAt?.getTime() ?? 0),
          );
        }
        // attach referee relation if asked (select or include)
        if (select?.referee || include?.referee) {
          rows = rows.map((x) => ({
            ...x,
            referee: x.refereeId ? store.users.get(x.refereeId) ?? null : null,
          })) as any;
        }
        if (include) return rows.map((x) => ({ ...x }));
        return rows.map((x) => (select ? pick(x, select) : { ...x }));
      },
      async count({ where }: any) {
        return store.referrals.filter((x) => matchWhere(x, where)).length;
      },
      async create({ data, select }: any) {
        // simulate unique refereeId
        if (data.refereeId) {
          const clash = store.referrals.find((x) => x.refereeId === data.refereeId);
          if (clash) throw new Error("unique refereeId");
        }
        const row: ReferralRow = {
          id: id("ref"),
          ownerId: data.ownerId,
          refereeId: data.refereeId ?? null,
          refereeEmail: data.refereeEmail ?? null,
          source: data.source ?? "link",
          listingId: data.listingId ?? null,
          token: data.token ?? null,
          status: data.status ?? "pending",
          rewardedAt: data.rewardedAt ?? null,
          createdAt: new Date(),
          qualifiedAt: data.qualifiedAt ?? null,
          ownerNotifiedAt: data.ownerNotifiedAt ?? null,
        };
        store.referrals.push(row);
        return pick(row, select);
      },
      async update({ where, data, select }: any) {
        const r = store.referrals.find((x) => x.id === where.id);
        if (!r) throw new Error("referral not found");
        if (data.refereeId !== undefined) {
          if (data.refereeId) {
            const clash = store.referrals.find(
              (x) => x.id !== r.id && x.refereeId === data.refereeId,
            );
            if (clash) throw new Error("unique refereeId");
          }
          r.refereeId = data.refereeId;
        }
        if (data.status !== undefined) r.status = data.status;
        if (data.qualifiedAt !== undefined) r.qualifiedAt = data.qualifiedAt;
        if (data.rewardedAt !== undefined) r.rewardedAt = data.rewardedAt;
        if (data.ownerNotifiedAt !== undefined) r.ownerNotifiedAt = data.ownerNotifiedAt;
        return pick(r, select);
      },
      async updateMany({ where, data }: any) {
        const rows = store.referrals.filter((x) => matchWhere(x, where));
        for (const r of rows) {
          if (data.ownerNotifiedAt !== undefined) r.ownerNotifiedAt = data.ownerNotifiedAt;
          if (data.status !== undefined) r.status = data.status;
        }
        return { count: rows.length };
      },
    },
    keysTransaction: {
      async findFirst({ where }: any) {
        return store.txns.find((x) => matchWhere(x, where)) ?? null;
      },
      async create({ data }: any) {
        const row: TxRow = {
          id: id("tx"),
          userId: data.userId,
          delta: data.delta,
          kind: data.kind,
          balanceAfter: data.balanceAfter,
          stayId: data.stayId ?? null,
          note: data.note ?? null,
          createdAt: new Date(),
        };
        store.txns.push(row);
        return { ...row };
      },
      async aggregate({ where }: any) {
        const sum = store.txns
          .filter((x) => matchWhere(x, where))
          .reduce((acc, x) => acc + x.delta, 0);
        return { _sum: { delta: sum } };
      },
    },
    async $transaction(fn: any) {
      // Same object acts as the tx client (single-threaded fake).
      return fn(client);
    },
  };

  return { store, client, id };
});

vi.mock("@/lib/db", () => ({ prisma: h.client }));
vi.mock("@/lib/auth/tokens", () => ({
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
}));
// The qualify hook lazy-imports the push adapter for the best-effort referrer
// push; stub it so tests don't touch FCM / a device table the fake lacks.
vi.mock("@/lib/push", () => ({
  sendPush: vi.fn(async () => {}),
  pushTemplates: { referralRewarded: () => ({ title: "", body: "", data: {} }) },
}));

import {
  ensureReferralCode,
  attributeSignupByCode,
  linkRefereeByEmail,
  linkRefereeByInviteToken,
  qualifyReferralsForReferee,
  refereeRewardFor,
  pendingReferrerNotifications,
  markReferrerNotificationsSeen,
} from "@/lib/growth/referrals";

function addUser(id: string, code: string | null = null, name: string | null = null): void {
  h.store.users.set(id, { id, keysBalance: 0, referralCode: code, name });
}

beforeEach(() => {
  h.store.users.clear();
  h.store.referrals.length = 0;
  h.store.txns.length = 0;
  h.store.seq = 0;
});

describe("ensureReferralCode", () => {
  it("mints a code lazily and is stable on repeat", async () => {
    addUser("u1");
    const code = await ensureReferralCode("u1");
    expect(code).toMatch(/^[A-Z2-9]{7}$/);
    expect(await ensureReferralCode("u1")).toBe(code); // idempotent
  });
});

describe("attributeSignupByCode", () => {
  it("creates a pending Referral linking owner -> referee", async () => {
    addUser("owner", "OWNERAA");
    addUser("newbie");
    const refId = await attributeSignupByCode("newbie", "OWNERAA");
    expect(refId).toBeTruthy();
    const row = h.store.referrals[0];
    expect(row).toMatchObject({ ownerId: "owner", refereeId: "newbie", status: "pending", source: "link" });
  });

  it("no-ops on unknown code, self-referral, or already-attributed user", async () => {
    addUser("owner", "OWNERAA");
    addUser("newbie");
    expect(await attributeSignupByCode("newbie", "NOPE")).toBeNull();
    expect(await attributeSignupByCode("owner", "OWNERAA")).toBeNull(); // self
    await attributeSignupByCode("newbie", "OWNERAA");
    expect(await attributeSignupByCode("newbie", "OWNERAA")).toBeNull(); // dup
    expect(h.store.referrals.length).toBe(1);
  });
});

describe("invite-to-stay linking", () => {
  it("links an email-keyed pending invite on signup", async () => {
    addUser("host");
    addUser("guest");
    h.store.referrals.push({
      id: "r1", ownerId: "host", refereeId: null, refereeEmail: "g@x.com",
      source: "invite_to_stay", listingId: "L1", token: "tok", status: "pending",
      rewardedAt: null, createdAt: new Date(), qualifiedAt: null, ownerNotifiedAt: null,
    });
    const linked = await linkRefereeByEmail("guest", "G@X.com");
    expect(linked).toBe("r1");
    expect(h.store.referrals[0].refereeId).toBe("guest");
  });

  it("links an open invite token, but not a claimed one", async () => {
    addUser("host");
    addUser("guest");
    addUser("other");
    h.store.referrals.push({
      id: "r1", ownerId: "host", refereeId: null, refereeEmail: null,
      source: "invite_to_stay", listingId: "L1", token: "TOK", status: "pending",
      rewardedAt: null, createdAt: new Date(), qualifiedAt: null, ownerNotifiedAt: null,
    });
    expect(await linkRefereeByInviteToken("guest", "TOK")).toBe("r1");
    // already claimed -> other can't link
    expect(await linkRefereeByInviteToken("other", "TOK")).toBeNull();
  });
});

describe("qualifyReferralsForReferee (anti-farm gate)", () => {
  it("credits BOTH sides exactly once and is idempotent on replay", async () => {
    addUser("owner", "OWNERAA");
    addUser("newbie");
    await attributeSignupByCode("newbie", "OWNERAA");

    const first = await qualifyReferralsForReferee("newbie");
    expect(first).toEqual({
      qualified: 1,
      rewarded: 1,
      refereeKeys: REFERRAL_REFEREE_KEYS,
      referrerName: null,
    });

    const ownerBonus = h.store.txns.filter((t) => t.kind === "referral_bonus");
    const refereeBonus = h.store.txns.filter((t) => t.kind === "invite_bonus");
    expect(ownerBonus).toHaveLength(1);
    expect(ownerBonus[0]).toMatchObject({ userId: "owner", delta: REFERRAL_REWARD_KEYS });
    expect(refereeBonus).toHaveLength(1);
    expect(refereeBonus[0]).toMatchObject({ userId: "newbie", delta: REFERRAL_REFEREE_KEYS });
    expect(h.store.users.get("owner")!.keysBalance).toBe(REFERRAL_REWARD_KEYS);
    expect(h.store.users.get("newbie")!.keysBalance).toBe(REFERRAL_REFEREE_KEYS);
    expect(h.store.referrals[0].status).toBe("rewarded");

    // Replay: no further Keys, no status churn.
    const replay = await qualifyReferralsForReferee("newbie");
    expect(replay).toEqual({ qualified: 0, rewarded: 0, refereeKeys: 0, referrerName: null });
    expect(h.store.txns.filter((t) => t.kind === "referral_bonus")).toHaveLength(1);
  });

  it("returns the credited Keys and referrer name, readable back via refereeRewardFor", async () => {
    addUser("owner", "OWNERAA", "Ada Lovelace");
    addUser("newbie");
    await attributeSignupByCode("newbie", "OWNERAA");

    const res = await qualifyReferralsForReferee("newbie");
    expect(res).toEqual({
      qualified: 1,
      rewarded: 1,
      refereeKeys: REFERRAL_REFEREE_KEYS,
      referrerName: "Ada Lovelace",
    });

    // The status endpoint reads the same reward back from persisted state.
    expect(await refereeRewardFor("newbie")).toEqual({
      keys: REFERRAL_REFEREE_KEYS,
      referrerName: "Ada Lovelace",
    });
    // No referral → no reward to surface.
    expect(await refereeRewardFor("owner")).toBeNull();
  });

  it("over the referrer's daily cap, marks qualified but pays no Keys", async () => {
    addUser("owner", "OWNERAA");
    // Pre-seed REFERRAL_DAILY_CAP already-rewarded referrals for this owner.
    for (let i = 0; i < REFERRAL_DAILY_CAP; i++) {
      h.store.referrals.push({
        id: `seed${i}`, ownerId: "owner", refereeId: `seed_ref${i}`, refereeEmail: null,
        source: "link", listingId: null, token: null, status: "rewarded",
        rewardedAt: new Date(), createdAt: new Date(), qualifiedAt: new Date(),
        ownerNotifiedAt: null,
      });
    }
    addUser("newbie");
    await attributeSignupByCode("newbie", "OWNERAA");

    const res = await qualifyReferralsForReferee("newbie");
    expect(res).toEqual({ qualified: 1, rewarded: 0, refereeKeys: 0, referrerName: null });
    const newRow = h.store.referrals.find((r) => r.refereeId === "newbie")!;
    expect(newRow.status).toBe("qualified"); // moved, but no payout
    expect(newRow.rewardedAt).toBeNull();
    expect(h.store.txns.filter((t) => t.kind === "referral_bonus")).toHaveLength(0);
    expect(h.store.users.get("newbie")!.keysBalance).toBe(0);
  });

  it("does nothing when the user has no pending referral", async () => {
    addUser("lonely");
    expect(await qualifyReferralsForReferee("lonely")).toEqual({
      qualified: 0,
      rewarded: 0,
      refereeKeys: 0,
      referrerName: null,
    });
  });
});

describe("referrer real-time notifications", () => {
  it("surfaces a rewarded referral as an unseen credit, then hides it once seen", async () => {
    addUser("owner", "OWNERAA", "Ada Lovelace");
    addUser("newbie", null, "Grace Hopper");
    await attributeSignupByCode("newbie", "OWNERAA");
    await qualifyReferralsForReferee("newbie");

    // The referrer sees one unseen credit naming the invitee + Keys earned.
    const unseen = await pendingReferrerNotifications("owner");
    expect(unseen).toHaveLength(1);
    expect(unseen[0]).toMatchObject({
      refereeName: "Grace Hopper",
      keys: REFERRAL_REWARD_KEYS,
    });
    expect(unseen[0].rewardedAt).toBeTruthy();

    // Acknowledge it; it's stamped seen and no longer surfaces.
    const seen = await markReferrerNotificationsSeen("owner", [unseen[0].id]);
    expect(seen).toBe(1);
    expect(await pendingReferrerNotifications("owner")).toHaveLength(0);

    // Idempotent: re-acking the same id stamps nothing further.
    expect(await markReferrerNotificationsSeen("owner", [unseen[0].id])).toBe(0);
  });

  it("only the owner can acknowledge their own credits", async () => {
    addUser("owner", "OWNERAA", "Ada");
    addUser("newbie");
    await attributeSignupByCode("newbie", "OWNERAA");
    await qualifyReferralsForReferee("newbie");

    const unseen = await pendingReferrerNotifications("owner");
    // A different user can't mark owner's credit seen.
    expect(await markReferrerNotificationsSeen("intruder", [unseen[0].id])).toBe(0);
    expect(await pendingReferrerNotifications("owner")).toHaveLength(1);
  });

  it("never surfaces qualified-but-unrewarded (capped) referrals", async () => {
    addUser("owner", "OWNERAA");
    for (let i = 0; i < REFERRAL_DAILY_CAP; i++) {
      h.store.referrals.push({
        id: `seed${i}`, ownerId: "owner", refereeId: `seed_ref${i}`, refereeEmail: null,
        source: "link", listingId: null, token: null, status: "rewarded",
        rewardedAt: new Date(), createdAt: new Date(), qualifiedAt: new Date(),
        ownerNotifiedAt: new Date(),
      });
    }
    addUser("newbie");
    await attributeSignupByCode("newbie", "OWNERAA");
    await qualifyReferralsForReferee("newbie"); // capped → qualified, no payout

    // The capped referral pays no Keys, so it is not an unseen credit.
    expect(await pendingReferrerNotifications("owner")).toHaveLength(0);
  });

  it("markReferrerNotificationsSeen with an empty list is a no-op", async () => {
    addUser("owner", "OWNERAA");
    expect(await markReferrerNotificationsSeen("owner", [])).toBe(0);
  });
});
