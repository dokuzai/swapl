// lib/auth/activity.ts — throttled lastActiveAt touch: writes when stale,
// skips when recent, and never throws when the update (or prisma itself)
// fails, since it runs fire-and-forget on the auth path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { updateMany: mocks.userUpdateMany } },
}));
// lib/log pulls in the Sentry wrapper, which is server-only.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/log/sentry", () => ({ captureError: vi.fn() }));

import {
  touchLastActive,
  ACTIVITY_THROTTLE_MS,
  __resetActivityThrottleForTests,
} from "@/lib/auth/activity";

async function flush() {
  // Let the fire-and-forget promise settle.
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetActivityThrottleForTests();
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("touchLastActive", () => {
  it("updates lastActiveAt with a stale-only WHERE clause", async () => {
    touchLastActive("u-1");
    await flush();

    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(1);
    const args = mocks.userUpdateMany.mock.calls[0][0];
    expect(args.where.id).toBe("u-1");
    // The DB-side throttle: only rows never seen or older than the window.
    expect(args.where.OR).toEqual([
      { lastActiveAt: null },
      { lastActiveAt: { lt: expect.any(Date) } },
    ]);
    expect(args.data.lastActiveAt).toBeInstanceOf(Date);
    const cutoff = args.where.OR[1].lastActiveAt.lt as Date;
    expect(args.data.lastActiveAt.getTime() - cutoff.getTime()).toBe(ACTIVITY_THROTTLE_MS);
  });

  it("skips the write when the same user was touched recently", async () => {
    touchLastActive("u-1");
    touchLastActive("u-1");
    await flush();
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(1);

    // A different user is not throttled by u-1's entry.
    touchLastActive("u-2");
    await flush();
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("writes again once the throttle window has elapsed", async () => {
    vi.useFakeTimers();
    touchLastActive("u-1");
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS - 1000);
    touchLastActive("u-1");
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000); // now past the window
    touchLastActive("u-1");
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the update rejects", async () => {
    mocks.userUpdateMany.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => touchLastActive("u-1")).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not throw when prisma itself blows up synchronously", () => {
    mocks.userUpdateMany.mockImplementation(() => {
      throw new Error("not a promise");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => touchLastActive("u-1")).not.toThrow();
    warn.mockRestore();
  });

  it("ignores empty user ids", async () => {
    touchLastActive("");
    await flush();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });
});
