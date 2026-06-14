// Shared error responses for API routes.
//
// Routes built up these JSON shapes by hand (`{ error, ...extras }` plus a
// status); this module centralises them WITHOUT changing any contract — the
// helpers emit byte-identical bodies/statuses to what the routes returned
// before, so existing web/iOS/Android clients keep working unchanged.

import { NextResponse } from "next/server";

/** Generic escape hatch: `{ error, ...extra }` with an arbitrary status. */
export function apiError(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/** 401 — no/invalid session or bearer token. Machine-readable code. */
export function unauthenticated(): NextResponse {
  return apiError(401, "UNAUTHENTICATED");
}

/** 403 — authenticated but not allowed. Message varies per call site. */
export function forbidden(
  error = "Forbidden",
  extra?: Record<string, unknown>
): NextResponse {
  return apiError(403, error, extra);
}

/** 403 — suspended account. Shared copy so every route says the same thing. */
export function accountSuspended(): NextResponse {
  return forbidden("ACCOUNT_SUSPENDED", {
    message: "This account has been suspended. Contact support@swapl.com.",
  });
}

/** 404 — resource missing (or hidden from this caller). */
export function notFound(error = "Not found"): NextResponse {
  return apiError(404, error);
}

/** 400 — malformed/invalid input. Pass zod issues via `extra`. */
export function invalidInput(
  error = "Invalid input",
  extra?: Record<string, unknown>
): NextResponse {
  return apiError(400, error, extra);
}

/** 422 — well-formed input that fails semantic rules. */
export function unprocessable(
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return apiError(422, error, extra);
}

/**
 * 429 — too many requests. Machine-readable `RATE_LIMITED` code plus a human
 * `message` clients can show verbatim. Routes used to return
 * `apiError(429, "Rate limited")` — a bare code with no message — which reached
 * users as an opaque generic error; this gives them something readable.
 */
export function rateLimited(
  message = "You're going a little fast — please wait a moment and try again.",
  extra?: Record<string, unknown>
): NextResponse {
  return apiError(429, "RATE_LIMITED", { message, ...extra });
}

/** 500 — unexpected failure. Keep the message generic; log details server-side. */
export function serverError(error = "Internal server error"): NextResponse {
  return apiError(500, error);
}
