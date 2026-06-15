// GET/POST /api/referrals/notifications — referrer real-time toast (DOK-157).
// Auth gating, unseen-credit read-through, and seen-ack pass-through.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  pendingReferrerNotifications: vi.fn(),
  markReferrerNotificationsSeen: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/growth/referrals", () => ({
  pendingReferrerNotifications: mocks.pendingReferrerNotifications,
  markReferrerNotificationsSeen: mocks.markReferrerNotificationsSeen,
}));

import { GET, POST } from "@/app/api/referrals/notifications/route";

const get = () => new Request("http://test/api/referrals/notifications");
const post = (body: unknown) =>
  new Request("http://test/api/referrals/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner-1", email: "a@b.c" });
});

describe("GET /api/referrals/notifications", () => {
  it("401s without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("returns the caller's unseen credits", async () => {
    const items = [{ id: "ref1", refereeName: "Grace", keys: 20, rewardedAt: "2026-06-15T00:00:00.000Z" }];
    mocks.pendingReferrerNotifications.mockResolvedValue(items);
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: items });
    expect(mocks.pendingReferrerNotifications).toHaveBeenCalledWith("owner-1");
  });
});

describe("POST /api/referrals/notifications", () => {
  it("401s without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await POST(post({ ids: ["ref1"] }));
    expect(res.status).toBe(401);
  });

  it("acks the given ids and returns the count seen", async () => {
    mocks.markReferrerNotificationsSeen.mockResolvedValue(1);
    const res = await POST(post({ ids: ["ref1", "ref2"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, seen: 1 });
    expect(mocks.markReferrerNotificationsSeen).toHaveBeenCalledWith("owner-1", ["ref1", "ref2"]);
  });

  it("ignores non-string / missing ids defensively", async () => {
    mocks.markReferrerNotificationsSeen.mockResolvedValue(0);
    const res = await POST(post({ ids: [1, null, "ok"] }));
    expect(res.status).toBe(200);
    expect(mocks.markReferrerNotificationsSeen).toHaveBeenCalledWith("owner-1", ["ok"]);
  });
});
