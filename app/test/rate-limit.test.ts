import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";

describe("clientIpFromRequest", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const req = new Request("https://swapl.test", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when no forwarded header is present", () => {
    const req = new Request("https://swapl.test", { headers: { "x-real-ip": "198.51.100.4" } });
    expect(clientIpFromRequest(req)).toBe("198.51.100.4");
  });

  it("returns 'unknown' when no client-ip headers are present", () => {
    expect(clientIpFromRequest(new Request("https://swapl.test"))).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Unique key per test so the module-level bucket map never leaks state
  // between cases.
  const freshKey = () => `test-${Math.random().toString(36).slice(2)}`;

  it("allows requests up to the limit, then blocks", () => {
    const key = freshKey();
    expect(checkRateLimit(key, 2, 1000)).toMatchObject({ ok: true, remaining: 1 });
    expect(checkRateLimit(key, 2, 1000)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = checkRateLimit(key, 2, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets the bucket once the window elapses", () => {
    const key = freshKey();
    expect(checkRateLimit(key, 1, 1000).ok).toBe(true);
    expect(checkRateLimit(key, 1, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, 1, 1000).ok).toBe(true);
  });

  it("tracks separate buckets per key", () => {
    const a = freshKey();
    const b = freshKey();
    expect(checkRateLimit(a, 1, 1000).ok).toBe(true);
    expect(checkRateLimit(a, 1, 1000).ok).toBe(false);
    expect(checkRateLimit(b, 1, 1000).ok).toBe(true);
  });
});
