// Server startup hook (Next.js instrumentation convention). Initializes the
// env-gated Sentry error tracking — a no-op when SENTRY_DSN is unset — and
// forwards unhandled server errors to it via onRequestError.

import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initErrorTracking } = await import("@/lib/log/sentry");
    await initErrorTracking();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("@/lib/log/sentry");
  captureError(err, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
