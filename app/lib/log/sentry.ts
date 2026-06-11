// Env-gated error tracking. instrumentation.ts calls initErrorTracking() at
// server startup; only when SENTRY_DSN is set does it load @sentry/node
// (server-only — no client bundles, no build plugin, the lightest Sentry
// footprint for a Next.js backend). Without a DSN every capture is a no-op,
// so local dev and tests never need Sentry configured.

import "server-only";

let sentry: typeof import("@sentry/node") | null = null;

export async function initErrorTracking(): Promise<boolean> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  if (sentry) return true;
  const mod = await import("@sentry/node");
  mod.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0, // errors only — no performance tracing
  });
  sentry = mod;
  return true;
}

/** No-op unless initErrorTracking() ran with SENTRY_DSN set. */
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, extra ? { extra } : undefined);
  } catch {
    // Error tracking must never take the app down.
  }
}
