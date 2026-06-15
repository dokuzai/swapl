// Listing valuation refresh (DOK-163). Periodic, idempotent, throttled recompute
// of the unified nightly-Keys valuation for active listings:
//   1. seed/refresh per-city desirability tiers (LocationTier)
//   2. re-run the bounded AI feature appraisal when the listing is STALE
//   3. advance the review feedback adjustment by one bounded cycle step
//   4. persist nightlyKeysBase / nightlyKeysAdjustment / nightlyKeys / tier /
//      valuationExplanation back onto the Listing
//
// Throttle: a listing is only recomputed when its valuation is stale
// (valuationUpdatedAt older than STALE_MS) or never computed. The feedback step
// is tiny per cycle, so reruns converge slowly — no swings. Reuses the umbrella
// daily cron (registered in ../daily/route.ts).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { composeValuation } from "@/lib/keys/valuation";
import { resolveLocationTiers, upsertLocationTier } from "@/lib/keys/location-tier";
import { seedLocationTier, normalizeCityKey } from "@/lib/keys/value";
import { amenityChips, toDTO } from "@/lib/listing-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_MS = 24 * 60 * 60 * 1000; // recompute a listing at most once/day
const BATCH = 200; // bound the work per invocation
const log = createLogger("cron:listing-valuation");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_MS);

  // Active listings that have never been valued OR whose valuation is stale.
  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      OR: [{ valuationUpdatedAt: null }, { valuationUpdatedAt: { lt: staleCutoff } }],
    },
    take: BATCH,
    orderBy: { valuationUpdatedAt: { sort: "asc", nulls: "first" } },
  });

  if (listings.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, tiersSeeded: 0 });
  }

  // 1) Ensure every city we touch has a persisted tier (seed from the map).
  const cities = Array.from(new Set(listings.map((l) => l.city)));
  const existingTiers = await resolveLocationTiers(cities);
  let tiersSeeded = 0;
  for (const city of cities) {
    const key = normalizeCityKey(city);
    const row = await prisma.locationTier.findUnique({ where: { city: key } });
    if (!row) {
      await upsertLocationTier(city, seedLocationTier(city), "seed");
      tiersSeeded++;
    }
  }

  // 2) Review signal per host (published reviews only), batched.
  const hostIds = Array.from(new Set(listings.map((l) => l.userId)));
  const reviewAgg = await prisma.swapReview.groupBy({
    by: ["subjectId"],
    where: { subjectId: { in: hostIds }, status: "published" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const reviewByHost = new Map(
    reviewAgg.map((r) => [r.subjectId, { avg: r._avg.rating, count: r._count._all }]),
  );

  let processed = 0;
  for (const l of listings) {
    try {
      const owner = await prisma.user.findUnique({
        where: { id: l.userId },
        select: { aiProvider: true, aiModel: true, aiApiKey: true },
      });
      const userOverride = owner
        ? { provider: owner.aiProvider, model: owner.aiModel, apiKey: owner.aiApiKey }
        : undefined;

      const tier = existingTiers.get(normalizeCityKey(l.city)) ?? seedLocationTier(l.city);
      const review = reviewByHost.get(l.userId);
      const amenities = amenityChips(toDTO(l));
      const photoCount = parseJSON<string[]>(l.photos, []).length;

      const result = await composeValuation(
        {
          city: l.city,
          country: l.country,
          sizeSqm: l.sizeSqm,
          sleeps: l.sleeps,
          isVerified: l.isVerified,
          spaceType: l.spaceType,
          roomsOffered: l.roomsOffered,
          photoCount,
          amenities,
          description: l.description,
          locationTier: tier,
          currentAdjustment: l.nightlyKeysAdjustment ?? 0,
          reviewCount: review?.count ?? 0,
          avgRating: review?.avg ?? null,
        },
        { userOverride },
      );

      await prisma.listing.update({
        where: { id: l.id },
        data: {
          nightlyKeys: result.nightlyKeys,
          nightlyKeysBase: result.nightlyKeysBase,
          nightlyKeysAdjustment: result.nightlyKeysAdjustment,
          locationTier: result.locationTier,
          valuationExplanation: JSON.stringify(result.explanation),
          valuationUpdatedAt: now,
        },
      });
      processed++;
    } catch (err) {
      log.error("valuation failed", err, { listingId: l.id });
    }
  }

  return NextResponse.json({ ok: true, processed, tiersSeeded });
}
