// Rate limiting.
//
// `checkRateLimit` is an in-memory fixed-window limiter — fine for dev / a
// single node, but NOT safe across serverless invocations.
//
// `checkRateLimitDurable` is the production path: a fixed-window counter backed
// by Upstash Redis (via its REST API, so no SDK dependency). In production it
// fails closed when Upstash is missing or unavailable; falling back to memory in
// serverless would make the control bypassable across instances.

const buckets = new Map<string, { count: number; resetAt: number }>();

// Best-effort client IP for unauthenticated rate limits. Vercel sets
// x-forwarded-for; fall back to remote-addr-style headers; finally to a
// constant so the bucket still functions in tests.
export function clientIpFromRequest(req: Request): string {
  // Prefer x-real-ip (set by the platform proxy, e.g. Vercel) over the leftmost
  // x-forwarded-for entry, which is fully client-controlled and trivially spoofed
  // to dodge per-IP limits. NOTE: per-IP limits are best-effort; account-scoped
  // limits (see the login route) are the real brute-force defence.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    // The rightmost entry is the one the closest trusted proxy appended.
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  // Prune expired entries to prevent unbounded memory growth.
  for (const [k, b] of buckets.entries()) {
    if (now >= b.resetAt) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { ok: true, remaining: limit - 1, resetAt: next.resetAt };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count++;
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt };
}

// ---------- durable limiter (Upstash Redis REST) ----------

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

function durableUnavailable(windowMs: number): RateLimitResult {
  return { ok: false, remaining: 0, resetAt: Date.now() + windowMs };
}

function shouldFailClosed(): boolean {
  return process.env.NODE_ENV === "production";
}

// Fixed-window counter shared across all serverless invocations via Upstash.
// Uses the REST pipeline: INCR the per-window key, then PEXPIRE it. Dev can
// fall back to memory; production must fail closed when the durable backend is
// unavailable.
export async function checkRateLimitDurable(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) {
    if (shouldFailClosed()) return durableUnavailable(windowMs);
    return checkRateLimit(key, limit, windowMs);
  }

  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;
  const resetAt = (windowIndex + 1) * windowMs;

  try {
    const res = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs)],
      ]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash HTTP ${res.status}`);
    const out = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = typeof out?.[0]?.result === "number" ? out[0].result : null;
    if (count == null) throw new Error("upstash: unexpected response shape");
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (err) {
    console.error("[rate-limit:upstash]", err);
    if (shouldFailClosed()) return durableUnavailable(windowMs);
    return checkRateLimit(key, limit, windowMs);
  }
}

// Clear a durable rate-limit counter for the CURRENT window. Used on a
// successful login so a legitimate user is never locked out by their own
// (eventually correct) attempts — only FAILED attempts accumulate toward the
// lockout. Best-effort: never throws, and is a no-op against a backend that's
// already empty.
export async function resetRateLimitDurable(key: string, windowMs: number): Promise<void> {
  buckets.delete(key); // clear any in-memory bucket (dev / fallback path)
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) return;
  const windowIndex = Math.floor(Date.now() / windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;
  try {
    await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["DEL", redisKey]]),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[rate-limit:reset]", err);
  }
}
