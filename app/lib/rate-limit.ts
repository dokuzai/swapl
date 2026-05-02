// Trivial in-memory rate limiter — fine for dev / single-node demo.
// Replace with Upstash Ratelimit in prod (the Vercel Postgres adapter is
// not safe across function invocations).

const buckets = new Map<string, { count: number; resetAt: number }>();

// Best-effort client IP for unauthenticated rate limits. Vercel sets
// x-forwarded-for; fall back to remote-addr-style headers; finally to a
// constant so the bucket still functions in tests.
export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
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
