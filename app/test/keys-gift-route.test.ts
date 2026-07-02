// POST /api/keys/gift (DOK-155): verified-only recipient + sender, daily cap,
// self-gift guard, and the happy path. Mocks the prisma surface + the ledger
// gift primitive (the atomic move itself is covered in keys-ledger.test.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { GIFT_DAILY_CAP } from "@/lib/keys/config";

const session = { userId: "sender", email: "s@swapl.test", name: "S" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  checkRateLimitDurable: vi.fn(),
  userFindUnique: vi.fn(),
  txAggregate: vi.fn(),
  gift: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDurable: mocks.checkRateLimitDurable }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    keysTransaction: { aggregate: mocks.txAggregate },
  },
}));
vi.mock("@/lib/keys/ledger", async (orig) => {
  const actual = await orig<typeof import("@/lib/keys/ledger")>();
  return { ...actual, gift: mocks.gift };
});
vi.mock("@/lib/push", () => ({ sendPush: () => Promise.resolve(), pushTemplates: { keysGiftReceived: () => ({}) } }));

import { POST } from "@/app/api/keys/gift/route";

function post(body: unknown) {
  return POST(new Request("https://swapl.test/api/keys/gift", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  // recipient verified, sender verified
  mocks.userFindUnique.mockImplementation(({ where }: any) => {
    if (where.id === "recipient") return { id: "recipient", verified: true, suspendedAt: null };
    if (where.id === "sender") return { verified: true, suspendedAt: null };
    return null;
  });
  mocks.txAggregate.mockResolvedValue({ _sum: { delta: 0 } });
  // The route enforces the rolling caps inside gift()'s validate callback; run
  // it against a fake tx so cap-exceeded still surfaces (real gift is mocked).
  mocks.gift.mockImplementation(async (_from: string, _to: string, _amount: number, _note: unknown, validate?: (tx: unknown) => Promise<void>) => {
    if (validate) await validate({ keysTransaction: { aggregate: mocks.txAggregate } });
    return { sent: { balanceAfter: 80 }, received: { balanceAfter: 20 } };
  });
});

describe("POST /api/keys/gift", () => {
  it("gifts to a verified recipient (happy path)", async () => {
    const res = await post({ toUserId: "recipient", amount: 20 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, amount: 20, balanceAfter: 80 });
    expect(mocks.gift).toHaveBeenCalledWith("sender", "recipient", 20, undefined, expect.any(Function));
  });

  it("rejects gifting to yourself", async () => {
    const res = await post({ toUserId: "sender", amount: 10 });
    expect(res.status).toBe(422);
    expect(mocks.gift).not.toHaveBeenCalled();
  });

  it("forbids gifting to an unverified recipient", async () => {
    mocks.userFindUnique.mockImplementation(({ where }: any) =>
      where.id === "recipient" ? { id: "recipient", verified: false, suspendedAt: null } : { verified: true, suspendedAt: null },
    );
    const res = await post({ toUserId: "recipient", amount: 10 });
    expect(res.status).toBe(403);
    expect(mocks.gift).not.toHaveBeenCalled();
  });

  it("enforces the daily cap", async () => {
    mocks.txAggregate.mockResolvedValue({ _sum: { delta: -GIFT_DAILY_CAP } }); // already at cap
    const res = await post({ toUserId: "recipient", amount: 10 });
    expect(res.status).toBe(422);
    // gift() is invoked; its validate callback throws the cap error → 422.
    expect(mocks.gift).toHaveBeenCalled();
  });

  it("rate-limits", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false });
    const res = await post({ toUserId: "recipient", amount: 10 });
    expect(res.status).toBe(429);
  });
});
