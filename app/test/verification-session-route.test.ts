// POST /api/verification/session + GET /api/verification/status — auth,
// env gating, rate limit, pending-session reuse, polling fallback.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  checkRateLimitDurable: vi.fn(),
  userFindUnique: vi.fn(),
  idvFindFirst: vi.fn(),
  // didit lib
  diditEnabled: vi.fn(),
  diditConfig: vi.fn(),
  createSession: vi.fn(),
  getSessionStatus: vi.fn(),
  applyVerificationUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  checkRateLimitDurable: mocks.checkRateLimitDurable,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    identityVerification: { findFirst: mocks.idvFindFirst },
  },
}));
vi.mock("@/lib/verification/didit", () => ({
  diditEnabled: mocks.diditEnabled,
  diditConfig: mocks.diditConfig,
  createSession: mocks.createSession,
  getSessionStatus: mocks.getSessionStatus,
  applyVerificationUpdate: mocks.applyVerificationUpdate,
}));

import { POST as sessionPOST } from "@/app/api/verification/session/route";
import { GET as statusGET } from "@/app/api/verification/status/route";

const post = () => new Request("http://test/api/verification/session", { method: "POST" });
const get = () => new Request("http://test/api/verification/status");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "user-1", email: "a@b.c" });
  mocks.checkRateLimitDurable.mockResolvedValue({ ok: true });
  mocks.diditEnabled.mockReturnValue(true);
  mocks.diditConfig.mockReturnValue({ enabled: true, webhookSecret: "whsec" });
  mocks.userFindUnique.mockResolvedValue({ id: "user-1", verified: false, verifiedAt: null });
  mocks.idvFindFirst.mockResolvedValue(null);
  mocks.createSession.mockResolvedValue({ sessionId: "sess-new", url: "https://verify/new" });
});

describe("POST /api/verification/session", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await sessionPOST(post())).status).toBe(401);
  });

  it("503 when Didit is unconfigured", async () => {
    mocks.diditEnabled.mockReturnValue(false);
    expect((await sessionPOST(post())).status).toBe(503);
  });

  it("429 when over the 3/h limit", async () => {
    mocks.checkRateLimitDurable.mockResolvedValue({ ok: false });
    expect((await sessionPOST(post())).status).toBe(429);
    expect(mocks.checkRateLimitDurable).toHaveBeenCalledWith(
      "verification:session:user-1",
      3,
      60 * 60 * 1000
    );
  });

  it("short-circuits for already-verified users", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", verified: true });
    const res = await sessionPOST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "approved", url: null });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a hosted session and returns its url", async () => {
    const res = await sessionPOST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "pending", url: "https://verify/new" });
    const [userId, callbackUrl] = mocks.createSession.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(callbackUrl).toContain("/dashboard?verification=done");
  });

  it("reuses a still-pending session instead of minting a new one", async () => {
    mocks.idvFindFirst.mockResolvedValue({ sessionId: "sess-old", status: "pending" });
    mocks.getSessionStatus.mockResolvedValue({ status: "pending", diditStatus: "In Progress", url: "https://verify/old", raw: {} });
    const res = await sessionPOST(post());
    expect(await res.json()).toEqual({ status: "pending", url: "https://verify/old", reused: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("syncs a stale pending row and opens a fresh session when it expired", async () => {
    mocks.idvFindFirst.mockResolvedValue({ sessionId: "sess-old", status: "pending" });
    mocks.getSessionStatus.mockResolvedValue({ status: "expired", diditStatus: "Expired", url: null, raw: {} });
    mocks.applyVerificationUpdate.mockResolvedValue({ id: "iv1", userId: "user-1", status: "expired", changed: true });
    const res = await sessionPOST(post());
    expect(mocks.applyVerificationUpdate).toHaveBeenCalledWith("sess-old", "Expired", {});
    expect(await res.json()).toEqual({ status: "pending", url: "https://verify/new" });
  });
});

describe("GET /api/verification/status", () => {
  it("401 without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await statusGET(get())).status).toBe(401);
  });

  it("reports 'none' (and enabled=false) when nothing happened yet", async () => {
    mocks.diditConfig.mockReturnValue({ enabled: false, webhookSecret: null });
    const res = await statusGET(get());
    expect(await res.json()).toMatchObject({ enabled: false, status: "none", verified: false });
  });

  it("returns the stored status without polling when a webhook secret exists", async () => {
    mocks.idvFindFirst.mockResolvedValue({ sessionId: "s1", status: "pending", completedAt: null });
    const res = await statusGET(get());
    expect(await res.json()).toMatchObject({ enabled: true, status: "pending" });
    expect(mocks.getSessionStatus).not.toHaveBeenCalled();
  });

  it("polls Didit for a pending attempt when no webhook secret is set", async () => {
    mocks.diditConfig.mockReturnValue({ enabled: true, webhookSecret: null });
    mocks.idvFindFirst.mockResolvedValue({ sessionId: "s1", status: "pending", completedAt: null });
    mocks.getSessionStatus.mockResolvedValue({ status: "approved", diditStatus: "Approved", url: null, raw: {} });
    mocks.applyVerificationUpdate.mockResolvedValue({ id: "iv1", userId: "user-1", status: "approved", changed: true });
    mocks.userFindUnique
      .mockResolvedValueOnce({ id: "user-1", verified: false, verifiedAt: null }) // initial read
      .mockResolvedValueOnce({ verifiedAt: new Date("2026-06-12T00:00:00Z") }); // refresh after approval
    const res = await statusGET(get());
    const j = await res.json();
    expect(mocks.applyVerificationUpdate).toHaveBeenCalledWith("s1", "Approved", {});
    expect(j).toMatchObject({ status: "approved", verified: true });
    expect(j.verifiedAt).toBe("2026-06-12T00:00:00.000Z");
  });
});
