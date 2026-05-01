// Cron endpoints accept either a Vercel cron header (the platform sends
// `Authorization: Bearer ${CRON_SECRET}` when configured), OR a manual
// header for local testing. Reject anything else.

import "server-only";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured: only allow in development to avoid hitting prod
    // accidentally with a misconfigured deployment.
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}
