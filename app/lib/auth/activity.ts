// Throttled "last seen" tracking. Called fire-and-forget from the session
// resolvers in lib/auth/session.ts on every authenticated request; writes
// User.lastActiveAt at most once per THROTTLE window per user per process.
//
// Two layers of throttling:
//   1. An in-process map skips the query entirely for users touched recently.
//   2. The updateMany WHERE clause (lastActiveAt null or older than the
//      window) makes the write a no-op across instances, so multi-instance
//      deployments don't amplify writes either.
//
// This must NEVER throw or delay the request: everything is wrapped and
// failures are only logged.

import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/log";

const log = createLogger("auth.activity");

export const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

const lastTouched = new Map<string, number>();

export function touchLastActive(userId: string): void {
  try {
    if (!userId) return;
    const now = Date.now();
    const prev = lastTouched.get(userId);
    if (prev !== undefined && now - prev < ACTIVITY_THROTTLE_MS) return;
    lastTouched.set(userId, now);

    const cutoff = new Date(now - ACTIVITY_THROTTLE_MS);
    void prisma.user
      .updateMany({
        where: {
          id: userId,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }],
        },
        data: { lastActiveAt: new Date(now) },
      })
      .catch((err) => {
        log.warn("lastActiveAt update failed", { userId, error: String(err) });
      });
  } catch (err) {
    // Defensive: a partially mocked prisma (tests) or anything unexpected
    // must not break the auth path.
    log.warn("lastActiveAt touch failed", { userId, error: String(err) });
  }
}

// Test hook: the throttle map is module-level state.
export function __resetActivityThrottleForTests(): void {
  lastTouched.clear();
}
