// POST /api/webhooks/didit — env gating (503 without secret), HMAC
// valid/invalid/replay, idempotent status application through the route.
// Uses the REAL lib/verification/didit (only prisma is mocked) so the route
// and the signature scheme are exercised end to end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const mocks = vi.hoisted(() => ({
  idvFindUnique: vi.fn(),
  idvUpdate: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  identityVerifiedEmail: vi.fn((to: string) => ({ to, subject: "You're verified ✓", text: "" })),
  identityVerificationFailedEmail: vi.fn((to: string) => ({
    to,
    subject: "Verification couldn't be completed",
    text: "",
  })),
  identityVerifiedPush: vi.fn(() => ({
    title: "You're verified ✓",
    body: "",
    data: { kind: "identityVerified", deepLink: "swapl://profile" },
  })),
  identityVerificationFailedPush: vi.fn(() => ({
    title: "Verification couldn't be completed",
    body: "",
    data: { kind: "identityVerificationFailed", deepLink: "swapl://profile" },
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    identityVerification: { findUnique: mocks.idvFindUnique, update: mocks.idvUpdate },
    user: { update: mocks.userUpdate, findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: {
    identityVerified: mocks.identityVerifiedEmail,
    identityVerificationFailed: mocks.identityVerificationFailedEmail,
  },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: {
    identityVerified: mocks.identityVerifiedPush,
    identityVerificationFailed: mocks.identityVerificationFailedPush,
  },
}));

import { POST } from "@/app/api/webhooks/didit/route";

const SECRET = "whsec-test";

function signedRequest(payload: unknown, opts: { secret?: string; ageSeconds?: number } = {}) {
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0));
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(raw, "utf8").digest("hex");
  return new Request("http://test/api/webhooks/didit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": sig, "x-timestamp": ts },
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DIDIT_WEBHOOK_SECRET = SECRET;
  mocks.idvFindUnique.mockResolvedValue({
    id: "iv1",
    userId: "user-1",
    sessionId: "sess-1",
    status: "pending",
  });
  mocks.userFindUnique.mockResolvedValue({ email: "ana@swapl.test" });
});

afterEach(() => {
  delete process.env.DIDIT_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/didit", () => {
  it("answers 503 when DIDIT_WEBHOOK_SECRET is unset", async () => {
    delete process.env.DIDIT_WEBHOOK_SECRET;
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Approved" }));
    expect(res.status).toBe(503);
  });

  it("rejects an invalid signature with 401 and writes nothing", async () => {
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Approved" }, { secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a replayed (stale-timestamp) delivery with 401", async () => {
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Approved" }, { ageSeconds: 600 }));
    expect(res.status).toBe(401);
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
  });

  it("400s when session_id or status is missing", async () => {
    const res = await POST(signedRequest({ status: "Approved" }));
    expect(res.status).toBe(400);
  });

  it("applies Approved: row completed + user verified/verifiedAt", async () => {
    const res = await POST(
      signedRequest({ session_id: "sess-1", status: "Approved", decision: { score: 1 } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "approved", changed: true });

    const update = mocks.idvUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("approved");
    expect(update.data.decision).toBe(JSON.stringify({ score: 1 }));
    expect(update.data.completedAt).toBeInstanceOf(Date);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { verified: true, verifiedAt: update.data.completedAt },
    });
    // "You're verified ✓" email + push to the user, best effort.
    expect(mocks.identityVerifiedEmail).toHaveBeenCalledWith("ana@swapl.test");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush).toHaveBeenCalledWith("user-1", mocks.identityVerifiedPush.mock.results[0].value);
  });

  it("applies Declined without touching the user", async () => {
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Declined" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "declined", changed: true });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    // "Verification couldn't be completed" email + push.
    expect(mocks.identityVerificationFailedEmail).toHaveBeenCalledWith("ana@swapl.test");
    expect(mocks.identityVerificationFailedPush).toHaveBeenCalled();
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("notification failures never break the webhook response", async () => {
    mocks.userFindUnique.mockRejectedValue(new Error("db hiccup"));
    mocks.sendPush.mockRejectedValue(new Error("fcm down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Approved" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "approved", changed: true });
    errSpy.mockRestore();
  });

  it("is idempotent: a (valid, fresh) re-delivery after approval is a no-op", async () => {
    mocks.idvFindUnique.mockResolvedValue({
      id: "iv1",
      userId: "user-1",
      sessionId: "sess-1",
      status: "approved",
    });
    const res = await POST(signedRequest({ session_id: "sess-1", status: "Approved" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "approved", changed: false });
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    // No transition → no double notification.
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("acknowledges unknown sessions (200) so Didit stops retrying", async () => {
    mocks.idvFindUnique.mockResolvedValue(null);
    const res = await POST(signedRequest({ session_id: "not-ours", status: "Approved" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, unknown: true });
  });
});
