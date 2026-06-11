// POST /api/auth/otp/request + /api/auth/otp/verify — route behaviour:
// opaque responses, rate limiting, find-or-create by destination, session
// shape parity with the password flows.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOtp: vi.fn(),
  verifyOtp: vi.fn(),
  sendEmail: vi.fn(),
  sendSms: vi.fn(),
  loginCode: vi.fn(),
  checkRateLimitDurable: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  setSession: vi.fn(),
  issueAuthToken: vi.fn(),
}));

vi.mock("@/lib/auth/otp", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/otp")>();
  return {
    ...real,
    createOtp: mocks.createOtp,
    verifyOtp: mocks.verifyOtp,
  };
});
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { loginCode: mocks.loginCode },
}));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sendSms }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...real,
    checkRateLimitDurable: mocks.checkRateLimitDurable,
  };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, create: mocks.userCreate, update: mocks.userUpdate },
  },
}));
vi.mock("@/lib/auth/session", () => ({
  setSession: mocks.setSession,
  issueAuthToken: mocks.issueAuthToken,
}));

import { POST as requestPOST } from "@/app/api/auth/otp/request/route";
import { POST as verifyPOST } from "@/app/api/auth/otp/verify/route";

function req(url: string, body: unknown) {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  mocks.createOtp.mockResolvedValue("123456");
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.sendSms.mockResolvedValue(undefined);
  mocks.loginCode.mockReturnValue({ to: "x", subject: "s", text: "t" });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.setSession.mockResolvedValue(undefined);
  mocks.issueAuthToken.mockResolvedValue({
    token: "raw-bearer",
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
  });
});

describe("POST /api/auth/otp/request", () => {
  it("emails a code and answers an opaque 200", async () => {
    const res = await requestPOST(req("/api/auth/otp/request", { channel: "email", destination: "Ada@Example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.createOtp).toHaveBeenCalledWith("email", "ada@example.com");
    expect(mocks.loginCode).toHaveBeenCalledWith("ada@example.com", "123456");
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("sends an SMS for channel=sms (console fallback in dev)", async () => {
    const res = await requestPOST(req("/api/auth/otp/request", { channel: "sms", destination: "+39 333 123 4567" }));
    expect(res.status).toBe(200);
    expect(mocks.createOtp).toHaveBeenCalledWith("sms", "+393331234567");
    expect(mocks.sendSms).toHaveBeenCalledWith("+393331234567", expect.stringContaining("123456"));
  });

  it("rejects malformed destinations", async () => {
    expect((await requestPOST(req("/api/auth/otp/request", { channel: "email", destination: "not-an-email" }))).status).toBe(400);
    expect((await requestPOST(req("/api/auth/otp/request", { channel: "sms", destination: "12345" }))).status).toBe(400);
  });

  it("rate limits per destination (5/15min) with a 429", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false });
    const res = await requestPOST(req("/api/auth/otp/request", { channel: "email", destination: "ada@example.com" }));
    expect(res.status).toBe(429);
    expect(mocks.createOtp).not.toHaveBeenCalled();
    expect(mocks.checkRateLimitDurable).toHaveBeenCalledWith(
      "otp-request:dest:ada@example.com",
      5,
      15 * 60 * 1000
    );
  });
});

describe("POST /api/auth/otp/verify", () => {
  it("creates an email user with emailVerifiedAt and sets the cookie (web)", async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: true, channel: "email" });
    mocks.userCreate.mockResolvedValue({
      id: "u9",
      email: "ada@example.com",
      name: "ada",
      avatar: null,
      suspendedAt: null,
      emailVerifiedAt: new Date(),
    });
    const res = await verifyPOST(req("/api/auth/otp/verify", { destination: "ada@example.com", code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, userId: "u9", emailVerified: true });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "ada@example.com", emailVerifiedAt: expect.any(Date) }),
    });
  });

  it("creates a phone user keyed on User.phone, bearer for native", async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: true, channel: "sms" });
    mocks.userCreate.mockResolvedValue({
      id: "u10",
      email: "ph393331234567@phone.local",
      phone: "+393331234567",
      name: null,
      avatar: null,
      suspendedAt: null,
      emailVerifiedAt: null,
    });
    const res = await verifyPOST(
      req("/api/auth/otp/verify", { destination: "+393331234567", code: "123456", platform: "android", appVersion: "2.0" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("raw-bearer");
    expect(body.user.id).toBe("u10");
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { phone: "+393331234567" } });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: "+393331234567", name: null }),
    });
    expect(mocks.issueAuthToken).toHaveBeenCalledWith("u10", "android", "2.0");
  });

  it("answers 401 for a wrong/expired code without leaking which", async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: false, reason: "wrong-code" });
    const r1 = await verifyPOST(req("/api/auth/otp/verify", { destination: "ada@example.com", code: "000000" }));
    mocks.verifyOtp.mockResolvedValue({ ok: false, reason: "expired" });
    const r2 = await verifyPOST(req("/api/auth/otp/verify", { destination: "ada@example.com", code: "000000" }));
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(await r1.json()).toEqual(await r2.json());
  });

  it("answers 429 once the attempt budget is exhausted", async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: false, reason: "too-many-attempts" });
    const res = await verifyPOST(req("/api/auth/otp/verify", { destination: "ada@example.com", code: "000000" }));
    expect(res.status).toBe(429);
  });

  it("blocks suspended users", async () => {
    mocks.verifyOtp.mockResolvedValue({ ok: true, channel: "email" });
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "ada@example.com",
      suspendedAt: new Date(),
      emailVerifiedAt: new Date(),
      name: "Ada",
      avatar: null,
    });
    const res = await verifyPOST(req("/api/auth/otp/verify", { destination: "ada@example.com", code: "123456" }));
    expect(res.status).toBe(403);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});
