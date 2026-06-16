// Cron endpoints accept either a Vercel cron header (the platform sends
// `Authorization: Bearer ${CRON_SECRET}` when configured), OR a manual
// header for local testing. Reject anything else.

import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided = req.headers.get("authorization") ?? "";
    const a = Buffer.from(provided);
    const b = Buffer.from(`Bearer ${expected}`);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  // SECURITY: fail CLOSED when no secret is configured. These jobs grant Keys,
  // complete agreements, and send mail — they must never be callable by an
  // anonymous request on any deployed environment (incl. preview/staging where
  // NODE_ENV may not be "production"). Local dev can opt in explicitly.
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_CRON === "1";
}
