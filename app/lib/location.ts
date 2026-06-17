// Records a user's coarse location for today, and keeps `lastSeen*` fresh so
// the daily cron can carry a location forward on quiet days. One row per
// (user, day) — a same-day GPS fix upgrades an earlier IP fix.

import { prisma } from "@/lib/db";
import { dayKey, type GeoFix } from "@/lib/geo";
import { parseSettings } from "@/lib/settings";

export type LocationSource = "gps" | "ip" | "carry";

const PRECEDENCE: Record<LocationSource, number> = { ip: 0, carry: 0, gps: 1 };

export async function recordLocation(
  userId: string,
  fix: GeoFix,
  source: LocationSource,
  when = new Date(),
): Promise<void> {
  if (!fix.countryCode) return; // nothing useful to store

  // Hard opt-in: nothing is stored unless the user enabled "Count my days
  // abroad". Off by default — this also stops carry-forward after opt-out.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
  if (!parseSettings(user?.settings).countDaysAbroad) return;

  const day = dayKey(when);
  const existing = await prisma.userLocationDay.findUnique({
    where: { userId_day: { userId, day } },
    select: { source: true },
  });

  // Don't let an IP/carry fix clobber a same-day device fix.
  if (existing && PRECEDENCE[source] < PRECEDENCE[(existing.source as LocationSource) ?? "ip"]) {
    // still refresh lastSeen below
  } else {
    await prisma.userLocationDay.upsert({
      where: { userId_day: { userId, day } },
      create: {
        userId,
        day,
        countryCode: fix.countryCode,
        region: fix.region,
        city: fix.city,
        source,
      },
      update: {
        countryCode: fix.countryCode,
        region: fix.region,
        city: fix.city,
        source,
      },
    });
  }

  // Carry-forward source for the cron, and a freshness signal.
  if (source !== "carry") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenCountry: fix.countryCode,
        lastSeenRegion: fix.region,
        lastSeenCity: fix.city,
        lastSeenAt: when,
      },
    });
  }
}
