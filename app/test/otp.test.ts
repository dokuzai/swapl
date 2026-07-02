// lib/auth/otp — code generation, hashing, expiry, attempt budget.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  otpUpdateMany: vi.fn(),
  otpCreate: vi.fn(),
  otpFindFirst: vi.fn(),
  otpUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    loginOtp: {
      updateMany: mocks.otpUpdateMany,
      create: mocks.otpCreate,
      findFirst: mocks.otpFindFirst,
      update: mocks.otpUpdate,
    },
  },
}));

import {
  createOtp,
  verifyOtp,
  hashOtpCode,
  generateOtpCode,
  normaliseDestination,
  OTP_MAX_ATTEMPTS,
} from "@/lib/auth/otp";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.otpUpdateMany.mockResolvedValue({ count: 0 });
  mocks.otpCreate.mockResolvedValue({});
  mocks.otpUpdate.mockResolvedValue({});
});

function row(over: Record<string, unknown> = {}) {
  return {
    id: "otp1",
    destination: "ada@example.com",
    channel: "email",
    codeHash: hashOtpCode("123456"),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

describe("generateOtpCode", () => {
  it("always returns exactly 6 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("normaliseDestination", () => {
  it("lowercases emails and strips formatting from phones", () => {
    expect(normaliseDestination("email", " Ada@Example.COM ")).toBe("ada@example.com");
    expect(normaliseDestination("sms", "+39 333 123-4567")).toBe("+393331234567");
  });
});

describe("createOtp", () => {
  it("voids outstanding codes and stores only the hash", async () => {
    const code = await createOtp("email", "ada@example.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(mocks.otpUpdateMany).toHaveBeenCalledWith({
      where: { destination: "ada@example.com", consumedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { consumedAt: expect.any(Date) },
    });
    const created = mocks.otpCreate.mock.calls[0][0].data;
    expect(created.codeHash).toBe(hashOtpCode(code));
    expect(created.codeHash).not.toContain(code);
    // 10 minute TTL.
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe("verifyOtp", () => {
  it("consumes the row on a correct code", async () => {
    mocks.otpFindFirst.mockResolvedValue(row());
    // Success consumes atomically via updateMany guarded on consumedAt: null.
    mocks.otpUpdateMany.mockResolvedValue({ count: 1 });
    const res = await verifyOtp("ada@example.com", "123456");
    expect(res).toEqual({ ok: true, channel: "email" });
    expect(mocks.otpUpdateMany).toHaveBeenCalledWith({
      where: { id: "otp1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("increments attempts on a wrong code", async () => {
    mocks.otpFindFirst.mockResolvedValue(row());
    const res = await verifyOtp("ada@example.com", "654321");
    expect(res).toEqual({ ok: false, reason: "wrong-code" });
    expect(mocks.otpUpdate).toHaveBeenCalledWith({
      where: { id: "otp1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("rejects expired codes", async () => {
    mocks.otpFindFirst.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await verifyOtp("ada@example.com", "123456")).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after the attempt budget, even with the right code", async () => {
    mocks.otpFindFirst.mockResolvedValue(row({ attempts: OTP_MAX_ATTEMPTS }));
    expect(await verifyOtp("ada@example.com", "123456")).toEqual({
      ok: false,
      reason: "too-many-attempts",
    });
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
  });

  it("reports the lockout on the guess that exhausts the budget", async () => {
    mocks.otpFindFirst.mockResolvedValue(row({ attempts: OTP_MAX_ATTEMPTS - 1 }));
    // The wrong-guess increment returns the row; at the cap it reports lockout.
    mocks.otpUpdate.mockResolvedValue({ attempts: OTP_MAX_ATTEMPTS });
    expect(await verifyOtp("ada@example.com", "000000")).toEqual({
      ok: false,
      reason: "too-many-attempts",
    });
  });

  it("returns not-found when there is no outstanding code", async () => {
    mocks.otpFindFirst.mockResolvedValue(null);
    expect(await verifyOtp("ada@example.com", "123456")).toEqual({ ok: false, reason: "not-found" });
  });
});
