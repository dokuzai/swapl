// POST /api/auth/change-password (DOK-149): wrong current → 403, weak new →
// 400, social-only accounts set a first password without a current one, and
// every other mobile AuthToken is revoked (the requesting bearer survives).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { hashPassword } from "@/lib/auth/passwords";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  authTokenUpdateMany: vi.fn(),
  sendEmail: vi.fn(),
  passwordChanged: vi.fn(),
  checkRateLimitDurable: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    authToken: { updateMany: mocks.authTokenUpdateMany },
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { passwordChanged: mocks.passwordChanged },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDurable: mocks.checkRateLimitDurable }));

import { POST } from "@/app/api/auth/change-password/route";

function post(body: unknown, headers?: Record<string, string>) {
  return POST(
    new Request("https://swapl.test/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    })
  );
}

let currentHash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentHash ??= await hashPassword("old-password");
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  mocks.userFindUnique.mockResolvedValue({
    id: "u-1",
    email: "ana@swapl.test",
    passwordHash: currentHash,
  });
  mocks.userUpdate.mockResolvedValue({});
  mocks.authTokenUpdateMany.mockResolvedValue({ count: 0 });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.passwordChanged.mockReturnValue({ to: "ana@swapl.test" });
});

describe("POST /api/auth/change-password", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await post({ currentPassword: "old-password", newPassword: "new-password" });
    expect(res.status).toBe(401);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false });
    const res = await post({ currentPassword: "old-password", newPassword: "new-password" });
    expect(res.status).toBe(429);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("403 when the current password is wrong", async () => {
    const res = await post({ currentPassword: "not-the-one", newPassword: "new-password" });
    expect(res.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.authTokenUpdateMany).not.toHaveBeenCalled();
  });

  it("403 when the account has a password but none was provided", async () => {
    const res = await post({ newPassword: "new-password" });
    expect(res.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("400 on a weak new password", async () => {
    const res = await post({ currentPassword: "old-password", newPassword: "short" });
    expect(res.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("changes the password, revokes other tokens and emails the user", async () => {
    const res = await post({ currentPassword: "old-password", newPassword: "new-password" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const update = mocks.userUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "u-1" });
    expect(update.data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(update.data.passwordHash).not.toBe(currentHash);

    // Cookie session (no bearer) → ALL mobile tokens are revoked.
    expect(mocks.authTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    expect(mocks.passwordChanged).toHaveBeenCalledWith("ana@swapl.test");
    expect(mocks.sendEmail).toHaveBeenCalled();
  });

  it("keeps the requesting bearer token, revokes the rest", async () => {
    const raw = "raw-bearer-token-123";
    const res = await post(
      { currentPassword: "old-password", newPassword: "new-password" },
      { Authorization: `Bearer ${raw}` }
    );
    expect(res.status).toBe(200);
    const expectedHash = createHash("sha256").update(raw).digest("hex");
    expect(mocks.authTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", revokedAt: null, tokenHash: { not: expectedHash } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("social/OTP-only accounts set their first password without a current one", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u-1",
      email: "ana@swapl.test",
      passwordHash: null,
    });
    const res = await post({ newPassword: "first-password" });
    expect(res.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalled();
    expect(mocks.authTokenUpdateMany).toHaveBeenCalled();
  });

  it("succeeds even when the email send fails (best effort)", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("resend down"));
    const res = await post({ currentPassword: "old-password", newPassword: "new-password" });
    expect(res.status).toBe(200);
  });
});
