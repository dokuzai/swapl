// Daily location continuity: for every recently-active user who has no location
// fix for today (didn't open the app, no fresh request), carry their last-known
// coarse location forward so "days abroad" stays continuous. Real device/IP
// fixes from /api/location/ping always take precedence over these carry rows.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { recordLocation, type LocationSource } from "@/lib/location";
import { dayKey } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("cron:location-sweep");

// Only carry forward for users seen within this window — stale beyond it and we
// genuinely don't know where they are.
const STALE_DAYS = 3;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const today = dayKey();
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const recent = await prisma.user.findMany({
    where: {
      lastSeenAt: { gte: cutoff },
      lastSeenCountry: { not: null },
      locationDays: { none: { day: today } },
    },
    select: { id: true, lastSeenCountry: true, lastSeenRegion: true, lastSeenCity: true },
    take: 5000,
  });

  let carried = 0;
  for (const u of recent) {
    try {
      await recordLocation(
        u.id,
        { countryCode: u.lastSeenCountry, region: u.lastSeenRegion, city: u.lastSeenCity },
        "carry" as LocationSource,
      );
      carried += 1;
    } catch (err) {
      log.error("carry failed", err, { userId: u.id });
    }
  }

  log.info("location sweep done", { carried, candidates: recent.length });
  return NextResponse.json({ ok: true, carried });
}
