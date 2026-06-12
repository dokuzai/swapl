// "Get Inspired" package composer (DOK-146).
//
// Principles:
// - The package proposes ONLY real, active listings whose availability is
//   compatible with the requested dates (or, when no dates are given, with
//   the user's own listing availability). Nothing is invented.
// - Affiliate enrichment reuses lib/discover (experiences) and the env-gated
//   partner registry (services) — unconfigured partners never appear, and no
//   prices or availability are attached to affiliate items.
// - Degrades without an AI key: deterministic top-score pick + templated copy.
// - Confirmation happens elsewhere through the same code path as
//   POST /api/proposals, so plan limits and suspension rules always apply.

import { prisma, parseJSON } from "@/lib/db";
import { computeMatchScore, type ScoreableListing } from "@/lib/match/score";
import { getDiscoverExperiences, type DiscoverExperience } from "@/lib/discover";
import { configuredPartners } from "@/lib/affiliates/registry";
import { resolveAIConfig, chat } from "./providers";
import { draftProposalMessage } from "./proposal-message";
import { readTravelProfile, buildTravelProfile, type TravelProfileData } from "./travel-profile";

const CANDIDATE_POOL = 60;
const TOP_COUNT = 3;
const MAX_EXPERIENCES = 3;
const WISHLIST_BOOST = 15;
const TRAIT_CITY_BOOST = 10;
const SERVICE_CATEGORIES = ["flights", "esim", "insurance"] as const;
const INSPIRE_CAMPAIGN = "inspire_package";

export class InspireError extends Error {
  constructor(public code: "NO_ACTIVE_LISTING" | "NO_CANDIDATES", message: string) {
    super(message);
  }
}

export type InspireOptions = {
  prompt?: string;
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string;
  flexible?: boolean;
};

export type InspireCandidate = {
  listingId: string;
  city: string;
  country: string;
  title: string;
  photo: string | null;
  matchScore: number;
};

export type InspireService = {
  slug: string;
  name: string;
  category: (typeof SERVICE_CATEGORIES)[number];
  /** Click-through via /api/affiliate/{slug} so the click is logged. */
  url: string;
};

export type InspirePackage = {
  packageId: string;
  myListingId: string;
  destination: InspireCandidate & { why: string };
  alternatives: InspireCandidate[];
  dates: { from: string; to: string; source: "user" | "availability" };
  proposalMessage: string;
  proposalMessageSource: "ai" | "fallback";
  experiences: DiscoverExperience[];
  services: InspireService[];
  /** Whether the destination pick + "why" came from the AI or the fallback. */
  source: "ai" | "fallback";
};

type ListingRow = {
  id: string;
  userId: string;
  title: string;
  city: string;
  country: string;
  neighbourhood: string;
  propertyType: string;
  sizeSqm: number;
  sleeps: number;
  bedrooms: number;
  petsAllowed: boolean;
  wfhSetup: boolean;
  stepFreeAccess: boolean;
  availableFrom: Date;
  availableTo: Date;
  photos: string;
  tags: string;
};

const LISTING_SELECT = {
  id: true,
  userId: true,
  title: true,
  city: true,
  country: true,
  neighbourhood: true,
  propertyType: true,
  sizeSqm: true,
  sleeps: true,
  bedrooms: true,
  petsAllowed: true,
  wfhSetup: true,
  stepFreeAccess: true,
  availableFrom: true,
  availableTo: true,
  photos: true,
  tags: true,
} as const;

function toScoreable(l: ListingRow): ScoreableListing {
  return {
    sizeSqm: l.sizeSqm,
    sleeps: l.sleeps,
    availableFrom: l.availableFrom,
    availableTo: l.availableTo,
    petsAllowed: l.petsAllowed,
    wfhSetup: l.wfhSetup,
    stepFreeAccess: l.stepFreeAccess,
    city: l.city,
    neighbourhood: l.neighbourhood,
  };
}

function firstPhoto(l: ListingRow): string | null {
  return parseJSON<string[]>(l.photos, [])[0] ?? null;
}

function toCandidate(l: ListingRow, matchScore: number): InspireCandidate {
  return { listingId: l.id, city: l.city, country: l.country, title: l.title, photo: firstPhoto(l), matchScore };
}

function affiliateHref(slug: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return `/api/affiliate/${slug}?${qs.toString()}`;
}

/** Env-gated travel services for the destination — flights, eSIM, insurance. */
function serviceLinks(destination: { city: string; country: string }): InspireService[] {
  return configuredPartners()
    .filter((p): p is typeof p & { category: InspireService["category"] } =>
      (SERVICE_CATEGORIES as readonly string[]).includes(p.category)
    )
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category as InspireService["category"],
      url: affiliateHref(p.slug, {
        city: destination.city,
        country: destination.country || undefined,
        utm_campaign: INSPIRE_CAMPAIGN,
      }),
    }));
}

function fallbackWhy(pick: { score: number; wishlisted: boolean; traitCity: boolean; listing: ListingRow }, profile: TravelProfileData | null): string {
  const bits: string[] = [];
  if (pick.wishlisted) bits.push("it's already on your wishlist");
  if (pick.traitCity) bits.push(`${pick.listing.city} keeps showing up in your activity`);
  if (profile?.traits.constraints.includes("wfh") && pick.listing.wfhSetup) bits.push("it has the WFH setup you need");
  if (profile?.traits.constraints.includes("pet-friendly") && pick.listing.petsAllowed) bits.push("pets are welcome");
  const reason = bits.length ? bits.join(", and ") : "its availability and size line up with your home";
  return `A ${pick.score}% match with your home — ${reason}.`;
}

const PICK_SYSTEM_PROMPT = `You are swapl's "Get Inspired" composer. Given a member's travel profile, an optional wish, and up to ${TOP_COUNT} real candidate swap homes, pick the single best destination.

Reply ONLY with strict JSON: {"pickId":"<listingId of one candidate>","why":"exactly 2 short sentences, second person, grounded ONLY in the given data"}.

Never invent amenities, prices or availability. The pickId MUST be one of the candidate ids.`;

/**
 * Composes a Get Inspired package: top real, date-compatible swap candidates
 * scored with the match engine (+ wishlist/profile-city boosts), an AI-chosen
 * destination with a "why this fits you", a proposal-message draft, and
 * env-gated affiliate enrichment. Persists an InspirationPackage draft.
 */
export async function composePackage(userId: string, opts: InspireOptions = {}): Promise<InspirePackage> {
  const [user, mine] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, aiProvider: true, aiModel: true, aiApiKey: true },
    }),
    prisma.listing.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: LISTING_SELECT,
    }),
  ]);
  if (!user || !mine) {
    throw new InspireError("NO_ACTIVE_LISTING", "You need an active listing before we can compose a swap package.");
  }
  const myListing = mine as ListingRow;

  // Date range: the user's explicit dates win; otherwise the availability of
  // their own listing (a swap needs both homes free anyway).
  const userDates = opts.dateFrom && opts.dateTo ? { from: new Date(opts.dateFrom), to: new Date(opts.dateTo) } : null;
  const range = userDates ?? { from: myListing.availableFrom, to: myListing.availableTo };
  const dates = {
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
    source: (userDates ? "user" : "availability") as "user" | "availability",
  };

  // Real, active, date-compatible candidates only — never the user's own.
  const [candidates, favorites, profile] = await Promise.all([
    prisma.listing.findMany({
      where: {
        isActive: true,
        NOT: { userId },
        availableFrom: { lte: range.to },
        availableTo: { gte: range.from },
      },
      take: CANDIDATE_POOL,
      select: LISTING_SELECT,
    }) as Promise<ListingRow[]>,
    prisma.favorite.findMany({ where: { userId }, select: { listingId: true } }),
    readTravelProfile(userId).then((p) => p ?? buildTravelProfile(userId)),
  ]);

  const wishlist = new Set(favorites.map((f) => f.listingId));
  const traitCities = new Set((profile?.traits.cities ?? []).map((c) => c.toLowerCase()));

  const scored = candidates
    .map((l) => {
      const wishlisted = wishlist.has(l.id);
      const traitCity = traitCities.has(l.city.toLowerCase());
      let score = computeMatchScore(toScoreable(myListing), toScoreable(l));
      if (wishlisted) score += WISHLIST_BOOST;
      if (traitCity) score += TRAIT_CITY_BOOST;
      score = Math.min(100, score);
      return { listing: l, score, wishlisted, traitCity };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_COUNT);

  if (scored.length === 0) {
    throw new InspireError("NO_CANDIDATES", "No active listings match those dates yet — try a wider range.");
  }

  // Destination pick + "why": AI when configured, top score otherwise.
  const userOverride = { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey };
  const config = resolveAIConfig({ userOverride });
  let pick = scored[0];
  let why = fallbackWhy(pick, profile);
  let source: "ai" | "fallback" = "fallback";
  if (config) {
    try {
      const text = await chat({
        config,
        responseJson: true,
        maxTokens: 300,
        temperature: 0.5,
        messages: [
          { role: "system", content: PICK_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              travelProfile: profile ? { summary: profile.summary, traits: profile.traits } : null,
              wish: opts.prompt ?? null,
              dates,
              candidates: scored.map((s) => ({
                id: s.listing.id,
                title: s.listing.title,
                city: s.listing.city,
                country: s.listing.country,
                neighbourhood: s.listing.neighbourhood,
                propertyType: s.listing.propertyType,
                sizeSqm: s.listing.sizeSqm,
                sleeps: s.listing.sleeps,
                petsAllowed: s.listing.petsAllowed,
                wfhSetup: s.listing.wfhSetup,
                stepFreeAccess: s.listing.stepFreeAccess,
                tags: parseJSON<string[]>(s.listing.tags, []),
                matchScore: s.score,
                onYourWishlist: s.wishlisted,
              })),
            }),
          },
        ],
      });
      const parsed = JSON.parse(extractJson(text)) as { pickId?: unknown; why?: unknown };
      const hit = scored.find((s) => s.listing.id === parsed.pickId);
      if (hit && typeof parsed.why === "string" && parsed.why.trim().length >= 10) {
        pick = hit;
        why = parsed.why.trim().slice(0, 500);
        source = "ai";
      }
    } catch (err) {
      console.error("[ai:inspire]", err);
      // keep the deterministic pick
    }
  }

  // Proposal-message draft — same style/code path as /api/ai/proposal-message
  // (draftProposalMessage env-gates its own AI usage and falls back cleanly).
  const draft = await draftProposalMessage(
    {
      proposer: { name: user.name, cityFrom: myListing.city, neighbourhoodFrom: myListing.neighbourhood },
      proposerListing: {
        sizeSqm: myListing.sizeSqm,
        sleeps: myListing.sleeps,
        petsAllowed: myListing.petsAllowed,
        wfhSetup: myListing.wfhSetup,
        stepFreeAccess: myListing.stepFreeAccess,
        summary: myListing.title,
      },
      targetListing: {
        title: pick.listing.title,
        cityTo: pick.listing.city,
        neighbourhoodTo: pick.listing.neighbourhood,
        sizeSqm: pick.listing.sizeSqm,
        sleeps: pick.listing.sleeps,
        petsAllowed: pick.listing.petsAllowed,
        wfhSetup: pick.listing.wfhSetup,
        stepFreeAccess: pick.listing.stepFreeAccess,
        bedrooms: pick.listing.bedrooms,
        propertyType: pick.listing.propertyType,
      },
      dateFrom: dates.from,
      dateTo: dates.to,
      hostNotes: opts.prompt,
    },
    { userOverride }
  );

  // Affiliate enrichment — env-gated, no invented prices/availability.
  const destination = { city: pick.listing.city, country: pick.listing.country };
  const experiences = (await getDiscoverExperiences(destination.city).catch((err) => {
    console.error("[inspire:experiences]", err);
    return [] as DiscoverExperience[];
  })).slice(0, MAX_EXPERIENCES);
  const services = serviceLinks(destination);

  const payload: Omit<InspirePackage, "packageId"> = {
    myListingId: myListing.id,
    destination: { ...toCandidate(pick.listing, pick.score), why },
    alternatives: scored.filter((s) => s.listing.id !== pick.listing.id).map((s) => toCandidate(s.listing, s.score)),
    dates,
    proposalMessage: draft.message,
    proposalMessageSource: draft.source,
    experiences,
    services,
    source,
  };

  const row = await prisma.inspirationPackage.create({
    data: { userId, status: "draft", payload: JSON.stringify(payload) },
  });

  return { ...payload, packageId: row.id };
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
