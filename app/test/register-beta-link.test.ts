// POST /api/auth/register — waitlist linking: a registering email that
// matches a BetaSignup row gets its userId connected (normalised email,
// best-effort so a marketing-table failure never blocks registration).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  betaUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, create: mocks.userCreate },
    betaSignup: { updateMany: mocks.betaUpdateMany },
  },
}));
vi.mock("@/lib/auth/passwords", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));
vi.mock("@/lib/auth/session", () => ({
  setSession: vi.fn().mockResolvedValue(undefined),
  issueAuthToken: vi.fn(),
}));
vi.mock("@/lib/auth/tokens", () => ({
  issueToken: vi.fn().mockResolvedValue("tok"),
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailTemplates: { verifyEmail: vi.fn().mockReturnValue({ to: "x" }) },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDurable: vi.fn().mockResolvedValue({ ok: true }),
  clientIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/auth/register/route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.userCreate.mockResolvedValue({ id: "u1", email: "ana@example.com", name: "ana" });
  mocks.betaUpdateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/auth/register — waitlist link", () => {
  it("connects a matching BetaSignup row using the normalised email", async () => {
    const res = await POST(req({ email: "Ana@Example.COM", password: "supersecret1" }));
    expect(res.status).toBe(200);
    expect(mocks.betaUpdateMany).toHaveBeenCalledWith({
      where: { email: "ana@example.com", userId: null },
      data: { userId: "u1" },
    });
  });

  it("does not fail registration when the waitlist link errors", async () => {
    mocks.betaUpdateMany.mockRejectedValue(new Error("db hiccup"));
    const res = await POST(req({ email: "ana@example.com", password: "supersecret1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
