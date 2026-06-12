// Umbrella daily cron: runs every periodic sweep in one invocation.
// Vercel's Hobby plan allows at most 2 cron jobs (daily schedules only), so a
// single dispatcher fans out to the individual routes, which stay independently
// invocable for manual runs and tests.

import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { GET as featuredExpire } from "../featured-expire/route";
import { GET as savedSearches } from "../saved-searches/route";
import { GET as agreementsComplete } from "../agreements-complete/route";
import { GET as preTripReminders } from "../pre-trip-reminders/route";
import { GET as reviewReminders } from "../review-reminders/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOBS: Array<[string, (req: Request) => Promise<Response>]> = [
  ["featured-expire", featuredExpire],
  ["saved-searches", savedSearches],
  ["agreements-complete", agreementsComplete],
  ["pre-trip-reminders", preTripReminders],
  ["review-reminders", reviewReminders],
];

const log = createLogger("cron:daily");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const results: Record<string, unknown> = {};
  let ok = true;
  for (const [name, job] of JOBS) {
    const startedAt = Date.now();
    try {
      const res = await job(req);
      const body = await res.json();
      results[name] = body;
      const durationMs = Date.now() - startedAt;
      if (res.ok) {
        log.info(`job ${name} completed`, { job: name, status: res.status, durationMs });
      } else {
        ok = false;
        log.error(`job ${name} failed`, undefined, { job: name, status: res.status, durationMs, result: body });
      }
    } catch (err) {
      // A job that throws must not block the jobs after it: record the error
      // (structured log + Sentry when configured) and move on.
      ok = false;
      results[name] = { error: err instanceof Error ? err.message : "unknown" };
      log.error(`job ${name} threw`, err, { job: name, durationMs: Date.now() - startedAt });
    }
  }
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
