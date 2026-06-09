// Umbrella daily cron: runs every periodic sweep in one invocation.
// Vercel's Hobby plan allows at most 2 cron jobs (daily schedules only), so a
// single dispatcher fans out to the individual routes, which stay independently
// invocable for manual runs and tests.

import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { GET as featuredExpire } from "../featured-expire/route";
import { GET as savedSearches } from "../saved-searches/route";
import { GET as agreementsComplete } from "../agreements-complete/route";
import { GET as preTripReminders } from "../pre-trip-reminders/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOBS: Array<[string, (req: Request) => Promise<Response>]> = [
  ["featured-expire", featuredExpire],
  ["saved-searches", savedSearches],
  ["agreements-complete", agreementsComplete],
  ["pre-trip-reminders", preTripReminders],
];

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const results: Record<string, unknown> = {};
  let ok = true;
  for (const [name, job] of JOBS) {
    try {
      const res = await job(req);
      results[name] = await res.json();
      if (!res.ok) ok = false;
    } catch (err) {
      ok = false;
      results[name] = { error: err instanceof Error ? err.message : "unknown" };
    }
  }
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
