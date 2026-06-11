// lib/verification/didit — Sessions API adapter (mocked fetch), webhook HMAC
// verification, and IdentityVerification state transitions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const mocks = vi.hoisted(() => ({
  idvCreate: vi.fn(),
  idvFindUnique: vi.fn(),
  idvUpdate: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    identityVerification: {
      create: mocks.idvCreate,
      findUnique: mocks.idvFindUnique,
      update: mocks.idvUpdate,
    },
    user: { update: mocks.userUpdate },
  },
}));

import {
  applyVerificationUpdate,
  createSession,
  DiditNotConfigured,
  diditEnabled,
  getSessionStatus,
  mapDiditStatus,
  verifyWebhookSignature,
} from "@/lib/verification/didit";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.DIDIT_API_KEY = "key-123";
  process.env.DIDIT_WORKFLOW_ID = "wf-456";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DIDIT_API_KEY;
  delete process.env.DIDIT_WORKFLOW_ID;
  delete process.env.DIDIT_WEBHOOK_SECRET;
});

describe("env gating", () => {
  it("is disabled without an API key", () => {
    delete process.env.DIDIT_API_KEY;
    expect(diditEnabled()).toBe(false);
  });

  it("is disabled without a workflow id (required by the Sessions API)", () => {
    delete process.env.DIDIT_WORKFLOW_ID;
    expect(diditEnabled()).toBe(false);
  });

  it("is enabled with key + workflow", () => {
    expect(diditEnabled()).toBe(true);
  });

  it("createSession throws DiditNotConfigured when disabled", async () => {
    delete process.env.DIDIT_API_KEY;
    await expect(createSession("u1", "http://cb")).rejects.toBeInstanceOf(DiditNotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createSession", () => {
  it("POSTs to /v3/session/ with x-api-key, saves the row, returns the hosted url", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "sess-1", url: "https://verify.didit.me/s/sess-1", status: "Not Started" }),
    });

    const out = await createSession("user-1", "https://app/dashboard?verification=done");

    expect(out).toEqual({ sessionId: "sess-1", url: "https://verify.didit.me/s/sess-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://verification.didit.me/v3/session/");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("key-123");
    expect(JSON.parse(init.body)).toEqual({
      workflow_id: "wf-456",
      vendor_data: "user-1",
      callback: "https://app/dashboard?verification=done",
    });
    expect(mocks.idvCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", provider: "didit", sessionId: "sess-1", status: "pending" },
    });
  });

  it("throws on a non-2xx response and saves nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    await expect(createSession("user-1", "http://cb")).rejects.toThrow("Didit create session failed (401)");
    expect(mocks.idvCreate).not.toHaveBeenCalled();
  });
});

describe("getSessionStatus", () => {
  it("GETs the decision endpoint and maps the status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "Approved", session_url: "https://verify.didit.me/s/sess-1" }),
    });
    const snap = await getSessionStatus("sess-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://verification.didit.me/v3/session/sess-1/decision/");
    expect(init.headers["x-api-key"]).toBe("key-123");
    expect(snap.status).toBe("approved");
    expect(snap.diditStatus).toBe("Approved");
    expect(snap.url).toBe("https://verify.didit.me/s/sess-1");
  });
});

describe("mapDiditStatus", () => {
  it("collapses the provider vocabulary onto our 4 states", () => {
    expect(mapDiditStatus("Approved")).toBe("approved");
    expect(mapDiditStatus("Declined")).toBe("declined");
    expect(mapDiditStatus("Expired")).toBe("expired");
    expect(mapDiditStatus("KYC Expired")).toBe("expired");
    expect(mapDiditStatus("Abandoned")).toBe("expired");
    for (const s of ["Not Started", "In Progress", "In Review", "Resubmitted", "Awaiting User", "whatever"]) {
      expect(mapDiditStatus(s)).toBe("pending");
    }
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "whsec-test";
  const body = JSON.stringify({ session_id: "sess-1", status: "Approved" });
  const sign = (raw: string, key = secret) => createHmac("sha256", key).update(raw, "utf8").digest("hex");
  const nowMs = 1_750_000_000_000;
  const ts = String(Math.floor(nowMs / 1000));

  it("accepts a valid signature with a fresh timestamp", () => {
    expect(verifyWebhookSignature(body, sign(body), ts, secret, nowMs)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "other"), ts, secret, nowMs)).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhookSignature(body.replace("Approved", "Declined"), sign(body), ts, secret, nowMs)).toBe(false);
  });

  it("rejects replays older than 5 minutes", () => {
    const stale = String(Math.floor(nowMs / 1000) - 301);
    expect(verifyWebhookSignature(body, sign(body), stale, secret, nowMs)).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyWebhookSignature(body, null, ts, secret, nowMs)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), null, secret, nowMs)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "not-a-number", secret, nowMs)).toBe(false);
  });
});

describe("applyVerificationUpdate (state transitions)", () => {
  const row = { id: "iv1", userId: "user-1", sessionId: "sess-1", status: "pending" };

  it("returns null for an unknown session", async () => {
    mocks.idvFindUnique.mockResolvedValue(null);
    expect(await applyVerificationUpdate("nope", "Approved")).toBeNull();
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
  });

  it("pending → approved stamps completedAt and User.verified/verifiedAt", async () => {
    mocks.idvFindUnique.mockResolvedValue({ ...row });
    const out = await applyVerificationUpdate("sess-1", "Approved", { ok: true });
    expect(out).toEqual({ id: "iv1", userId: "user-1", status: "approved", changed: true });
    const update = mocks.idvUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "iv1" });
    expect(update.data.status).toBe("approved");
    expect(update.data.completedAt).toBeInstanceOf(Date);
    expect(update.data.decision).toBe(JSON.stringify({ ok: true }));
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { verified: true, verifiedAt: update.data.completedAt },
    });
  });

  it("pending → declined completes the row without touching the user", async () => {
    mocks.idvFindUnique.mockResolvedValue({ ...row });
    const out = await applyVerificationUpdate("sess-1", "Declined");
    expect(out!.status).toBe("declined");
    expect(out!.changed).toBe(true);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("identical replays are no-ops (idempotent)", async () => {
    mocks.idvFindUnique.mockResolvedValue({ ...row, status: "approved" });
    const out = await applyVerificationUpdate("sess-1", "Approved");
    expect(out).toEqual({ id: "iv1", userId: "user-1", status: "approved", changed: false });
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("terminal states never regress on late out-of-order events", async () => {
    mocks.idvFindUnique.mockResolvedValue({ ...row, status: "approved" });
    const out = await applyVerificationUpdate("sess-1", "In Progress");
    expect(out!.status).toBe("approved");
    expect(out!.changed).toBe(false);
    expect(mocks.idvUpdate).not.toHaveBeenCalled();
  });

  it("pending intermediate updates stay pending without completedAt", async () => {
    mocks.idvFindUnique.mockResolvedValue({ ...row, status: "pending" });
    const out = await applyVerificationUpdate("sess-1", "In Review");
    // "In Review" maps to pending — same state, so nothing to write.
    expect(out!.changed).toBe(false);
  });
});
