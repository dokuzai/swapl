// Public host profile: name, bio, verification status, interests, rich
// profile fields (work, languages, home city — privacy-gated), swap stats,
// visited cities (from COMPLETED agreements) and the latest reviews, plus the
// host's active listings. Mirrors /profile/[id] page.
//
// Reviews & stats count ONLY status="published" — hidden (moderated) reviews
// disappear from the public surface entirely (DOK-149).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { toDTO } from "@/lib/listing-utils";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { INTEREST_BY_SLUG } from "@/lib/interests";
import { dictionaryForRequest } from "@/lib/i18n/request-dict";
import type { DictKey } from "@/lib/i18n/dict-en";

const MIN_MS = 60 * 1000;
const LIMIT_PER_MIN = 60;

export async function GET(req: Request, { params }: RouteContext<"/api/profiles/[id]">) {
  // Public + enumerable by id → per-IP durable limit, same budget as discover.
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`profiles:${ip}`, LIMIT_PER_MIN, MIN_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatar: true,
      bio: true,
      bioVibe: true,
      verified: true,
      interests: true,
      work: true,
      languages: true,
      homeCity: true,
      homeCountry: true,
      settings: true,
      createdAt: true,
      suspendedAt: true,
    },
  });
  // Moderation: suspended hosts are hidden — indistinguishable from missing.
  if (!user || user.suspendedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = parseSettings(user.settings);

  const [listings, completedAgreements, reviewAgg, reviews] = await Promise.all([
    prisma.listing.findMany({
      where: { userId: id, isActive: true, ineligibleReason: null },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // COMPLETED swaps the host took part in — powers stats.swapsCompleted and
    // the "Where I've been" strip (the OTHER listing's city = the one visited).
    prisma.swapAgreement.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ listing1: { userId: id } }, { listing2: { userId: id } }],
      },
      select: {
        dateTo: true,
        listing1: { select: { userId: true, city: true, country: true } },
        listing2: { select: { userId: true, city: true, country: true } },
      },
      orderBy: { dateTo: "desc" },
    }),
    prisma.swapReview.aggregate({
      where: { subjectId: id, status: "published" },
      _count: true,
      _avg: { rating: true },
    }),
    prisma.swapReview.findMany({
      where: { subjectId: id, status: "published" },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Visited cities, deduped (a repeat swap to the same city in the same year
  // collapses), newest first.
  const seen = new Set<string>();
  const visited: { city: string; country: string; year: number }[] = [];
  for (const a of completedAgreements) {
    const other = a.listing1.userId === id ? a.listing2 : a.listing1;
    const year = a.dateTo.getFullYear();
    const key = `${other.city}|${other.country}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visited.push({ city: other.city, country: other.country, year });
  }

  // Resolve stored interest slugs to localized labels (cookie / Accept-Language)
  // so the mobile public profile shows the same Italian taxonomy as web.
  const dict = dictionaryForRequest(req);
  // Resolve known interest slugs to localized labels; pass through any value
  // not in the catalog unchanged (no data loss / contract stays string[]).
  const interestLabels = parseJSON<string[]>(user.interests, []).map((s) => {
    const tag = INTEREST_BY_SLUG.get(s);
    return tag ? dict[`interest.${tag.slug}` as DictKey] ?? tag.label : s;
  });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      bioVibe: user.bioVibe,
      verified: user.verified,
      memberSince: user.createdAt.toISOString(),
      interests: interestLabels,
      work: user.work,
      languages: parseJSON<string[]>(user.languages, []),
      // Privacy: the host can hide their home city from the public profile.
      homeCity: settings.showHomeCity ? user.homeCity : null,
      homeCountry: settings.showHomeCity ? user.homeCountry : null,
    },
    stats: {
      swapsCompleted: completedAgreements.length,
      reviewsCount: reviewAgg._count,
      avgRating: reviewAgg._avg.rating != null ? Math.round(reviewAgg._avg.rating * 10) / 10 : null,
      memberSince: user.createdAt.toISOString(),
    },
    visited,
    reviews: reviews.map((r) => ({
      id: r.id,
      author: { id: r.author.id, name: r.author.name, avatar: r.author.avatar },
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    })),
    listings: listings.map((l) => toDTO(l)),
  });
}
