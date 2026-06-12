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
const CONSTRAINT_BOOST = 8;
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
  city?: string;
  flexible?: boolean;
};

// ---------- spoken-filter extraction (DOK-148) ----------

export type TripFilters = {
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string;
  /** Canonical city name — always one of the active-listing cities. */
  city?: string;
  constraints?: TripConstraint[];
};

export type TripConstraint = "pet-friendly" | "wfh" | "step-free";

export type InterpretedFilters = TripFilters & { source: "ai" | "heuristic" };

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const CONSTRAINT_PATTERNS: Array<[TripConstraint, RegExp]> = [
  ["pet-friendly", /\b(pet[\s-]?friendly|pets?|dog|cat)\b/i],
  ["wfh", /\b(wfh|work(ing)? from home|remote[\s-]work|home office|desk)\b/i],
  ["step-free", /\b(step[\s-]?free|wheelchair|accessib\w*|no stairs)\b/i],
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Resolve a month/day pair without an explicit year to the next occurrence. */
function resolveYear(month: number, day: number, now: Date): number {
  const year = now.getUTCFullYear();
  return new Date(Date.UTC(year, month, day)) < now ? year + 1 : year;
}

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const SEP_RE = "(?:\\s*(?:to|until|till|through|–|—|->|-)\\s*)";

function monthIndex(name: string): number {
  return MONTHS[name.slice(0, 4) === "sept" ? "sept" : name.slice(0, 3)];
}

/** Deterministic date-range parsing: ISO ranges, "Sep 5–15", "5–15 September", "Sep 5 – Oct 2". */
function parseDateRange(prompt: string, now: Date): { dateFrom: string; dateTo: string } | null {
  // 1) "2026-09-05 to 2026-09-15"
  const iso = prompt.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|until|till|through|–|—|->|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (iso && iso[2] > iso[1]) return { dateFrom: iso[1], dateTo: iso[2] };

  // 2) "Sep 5 – 15", "September 5 to October 2", optional trailing year
  const m1 = prompt.match(
    new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?${SEP_RE}(?:${MONTH_RE}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?`, "i")
  );
  if (m1) {
    const fromMonth = monthIndex(m1[1].toLowerCase());
    const toMonth = m1[3] ? monthIndex(m1[3].toLowerCase()) : fromMonth;
    const fromDay = Number(m1[2]);
    const toDay = Number(m1[4]);
    const year = m1[5] ? Number(m1[5]) : resolveYear(fromMonth, fromDay, now);
    const toYear = toMonth < fromMonth ? year + 1 : year;
    const dateFrom = ymd(year, fromMonth, fromDay);
    const dateTo = ymd(toYear, toMonth, toDay);
    if (dateTo > dateFrom) return { dateFrom, dateTo };
  }

  // 3) "5–15 September", "5 to 15 Sep 2026"
  const m2 = prompt.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?${SEP_RE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:[,\\s]+(\\d{4}))?`, "i")
  );
  if (m2) {
    const month = monthIndex(m2[3].toLowerCase());
    const fromDay = Number(m2[1]);
    const toDay = Number(m2[2]);
    const year = m2[4] ? Number(m2[4]) : resolveYear(month, fromDay, now);
    const dateFrom = ymd(year, month, fromDay);
    const dateTo = ymd(year, month, toDay);
    if (dateTo > dateFrom) return { dateFrom, dateTo };
  }

  return null;
}

function heuristicFilters(prompt: string, knownCities: string[], now: Date): TripFilters {
  const out: TripFilters = {};

  // City: longest known city first so "New York" beats "York".
  const sorted = [...knownCities].sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(prompt)) {
      out.city = city;
      break;
    }
  }

  const range = parseDateRange(prompt, now);
  if (range) {
    out.dateFrom = range.dateFrom;
    out.dateTo = range.dateTo;
  }

  const constraints = CONSTRAINT_PATTERNS.filter(([, re]) => re.test(prompt)).map(([c]) => c);
  if (constraints.length) out.constraints = constraints;

  return out;
}

const EXTRACT_SYSTEM_PROMPT = `You extract structured swap-trip filters from a member's (possibly voice-transcribed) wish.
Reply ONLY with strict JSON: {"dateFrom":"yyyy-MM-dd"|null,"dateTo":"yyyy-MM-dd"|null,"city":"<one of the provided cities>"|null,"constraints":["pet-friendly"|"wfh"|"step-free", ...]}.
Rules: city MUST be copied verbatim from the provided list (null if none mentioned); resolve relative dates against "today"; never invent dates that were not implied.`;

/**
 * Extracts { dateFrom, dateTo, city, constraints } from a free-text (or
 * voice-transcribed) wish. Uses the configured AI when available, otherwise
 * deterministic regex/heuristics (dates + cities known from active listings).
 * Anything not understood is simply omitted — explicit filters always win
 * over the extraction at the call site.
 */
export async function extractTripFilters(
  prompt: string,
  opts: { knownCities: string[]; aiConfig?: ReturnType<typeof resolveAIConfig>; now?: Date }
): Promise<InterpretedFilters | null> {
  const now = opts.now ?? new Date();
  const heuristic = heuristicFilters(prompt, opts.knownCities, now);

  if (opts.aiConfig) {
    try {
      const text = await chat({
        config: opts.aiConfig,
        responseJson: true,
        maxTokens: 200,
        temperature: 0,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ today: now.toISOString().slice(0, 10), cities: opts.knownCities, wish: prompt }),
          },
        ],
      });
      const parsed = JSON.parse(extractJson(text)) as Record<string, unknown>;
      const out: TripFilters = {};
      if (typeof parsed.city === "string") {
        const hit = opts.knownCities.find((c) => c.toLowerCase() === (parsed.city as string).toLowerCase());
        if (hit) out.city = hit;
      }
      if (
        typeof parsed.dateFrom === "string" && ISO_DATE.test(parsed.dateFrom) &&
        typeof parsed.dateTo === "string" && ISO_DATE.test(parsed.dateTo) &&
        parsed.dateTo > parsed.dateFrom
      ) {
        out.dateFrom = parsed.dateFrom;
        out.dateTo = parsed.dateTo;
      }
      if (Array.isArray(parsed.constraints)) {
        const valid = parsed.constraints.filter(
          (c): c is TripConstraint => c === "pet-friendly" || c === "wfh" || c === "step-free"
        );
        if (valid.length) out.constraints = [...new Set(valid)];
      }
      if (Object.keys(out).length > 0) return { ...out, source: "ai" };
    } catch (err) {
      console.error("[ai:inspire:extract]", err);
      // fall through to the heuristic result
    }
  }

  return Object.keys(heuristic).length > 0 ? { ...heuristic, source: "heuristic" } : null;
}

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

/** Every package item is individually toggleable (PATCH …/items). */
export type InspireItemFlags = { id: string; selected: boolean };

export type InspireExperienceItem = DiscoverExperience & InspireItemFlags;
export type InspireServiceItem = InspireService & InspireItemFlags;

/**
 * A swapl concierge add-on offered inside the package. The ONLY payable items:
 * external affiliate experiences/services stay links and are never charged by
 * us. Charged off-session only after the host accepts the proposal.
 */
export type InspireAddOnItem = InspireItemFlags & {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  provider: string;
  category: string;
};

export type InspirePackage = {
  packageId: string;
  myListingId: string;
  destination: InspireCandidate & { why: string };
  alternatives: InspireCandidate[];
  dates: { from: string; to: string; source: "user" | "interpreted" | "availability" };
  proposalMessage: string;
  proposalMessageSource: "ai" | "fallback";
  experiences: InspireExperienceItem[];
  services: InspireServiceItem[];
  addOns: InspireAddOnItem[];
  /** What was understood from the spoken/free-text prompt, if anything. */
  interpreted: InterpretedFilters | null;
  /** Whether the destination pick + "why" came from the AI or the fallback. */
  source: "ai" | "fallback";
};

export type InspirePayload = Omit<InspirePackage, "packageId">;

/** The payable subset of a package: selected concierge add-ons with a real price. */
export function selectedPayableAddOns(payload: Pick<InspirePayload, "addOns">): InspireAddOnItem[] {
  return (payload.addOns ?? []).filter((a) => a.selected && a.priceCents > 0);
}

export function payableSummary(payload: Pick<InspirePayload, "addOns">): {
  payableItems: InspireAddOnItem[];
  totalCents: number;
  currency: string;
} {
  const payableItems = selectedPayableAddOns(payload);
  return {
    payableItems,
    totalCents: payableItems.reduce((sum, a) => sum + a.priceCents, 0),
    currency: payableItems[0]?.currency ?? "EUR",
  };
}

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

  const userOverride = { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey };
  const config = resolveAIConfig({ userOverride });

  // Spoken/free-text filter extraction (DOK-148): the prompt — possibly a
  // voice transcription — is parsed into structured filters. Explicit filters
  // always win; whatever was understood is surfaced as `interpreted` so the
  // clients can show "Understood: Lisbon, Sep 5–15, pet-friendly".
  let interpreted: InterpretedFilters | null = null;
  if (opts.prompt?.trim()) {
    const cityRows = (await prisma.listing.findMany({
      where: { isActive: true },
      select: { city: true },
      distinct: ["city"],
    })) as Array<{ city: string }>;
    interpreted = await extractTripFilters(opts.prompt, {
      knownCities: cityRows.map((r) => r.city),
      aiConfig: config,
    });
  }

  const effDateFrom = opts.dateFrom ?? interpreted?.dateFrom;
  const effDateTo = opts.dateTo ?? interpreted?.dateTo;
  const effCity = opts.city ?? interpreted?.city;
  const constraints = interpreted?.constraints ?? [];

  // Date range: explicit dates win, then dates understood from the prompt,
  // otherwise the availability of the user's own listing (a swap needs both
  // homes free anyway).
  const userDates = effDateFrom && effDateTo ? { from: new Date(effDateFrom), to: new Date(effDateTo) } : null;
  const range = userDates ?? { from: myListing.availableFrom, to: myListing.availableTo };
  const dates = {
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
    source: (userDates ? (opts.dateFrom && opts.dateTo ? "user" : "interpreted") : "availability") as
      | "user"
      | "interpreted"
      | "availability",
  };

  // Real, active, date-compatible candidates only — never the user's own.
  // A requested/understood city narrows the pool to that destination.
  const [candidates, favorites, profile] = await Promise.all([
    prisma.listing.findMany({
      where: {
        isActive: true,
        NOT: { userId },
        availableFrom: { lte: range.to },
        availableTo: { gte: range.from },
        ...(effCity ? { city: effCity } : {}),
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
      // Understood constraints gently re-rank towards homes that satisfy them.
      if (constraints.includes("pet-friendly") && l.petsAllowed) score += CONSTRAINT_BOOST;
      if (constraints.includes("wfh") && l.wfhSetup) score += CONSTRAINT_BOOST;
      if (constraints.includes("step-free") && l.stepFreeAccess) score += CONSTRAINT_BOOST;
      score = Math.min(100, score);
      return { listing: l, score, wishlisted, traitCity };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_COUNT);

  if (scored.length === 0) {
    throw new InspireError("NO_CANDIDATES", "No active listings match those dates yet — try a wider range.");
  }

  // Destination pick + "why": AI when configured, top score otherwise.
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

  // Affiliate enrichment — env-gated, no invented prices/availability. Every
  // item gets a stable id + selected:true so the draft is editable via
  // PATCH …/items before confirming.
  const destination = { city: pick.listing.city, country: pick.listing.country };
  const experiences: InspireExperienceItem[] = (await getDiscoverExperiences(destination.city).catch((err) => {
    console.error("[inspire:experiences]", err);
    return [] as DiscoverExperience[];
  }))
    .slice(0, MAX_EXPERIENCES)
    .map((e, i) => ({ ...e, id: `exp-${i + 1}`, selected: true }));
  const services: InspireServiceItem[] = serviceLinks(destination).map((s) => ({
    ...s,
    id: `svc-${s.slug}`,
    selected: true,
  }));

  // Concierge add-ons with real prices — the ONLY payable items of a package
  // (charged off-session only after the host accepts). Affiliate items above
  // are never charged by us.
  const addOnRows = (await prisma.addOn.findMany({
    where: { isActive: true, type: "flat_fee", priceCents: { gt: 0 } },
    orderBy: { priceCents: "desc" },
  })) as Array<{ slug: string; name: string; description: string; priceCents: number; currency: string; provider: string; category: string }>;
  const addOns: InspireAddOnItem[] = addOnRows.map((a) => ({
    id: `addon-${a.slug}`,
    selected: true,
    slug: a.slug,
    name: a.name,
    description: a.description,
    priceCents: a.priceCents,
    currency: a.currency,
    provider: a.provider,
    category: a.category,
  }));

  const payload: InspirePayload = {
    myListingId: myListing.id,
    destination: { ...toCandidate(pick.listing, pick.score), why },
    alternatives: scored.filter((s) => s.listing.id !== pick.listing.id).map((s) => toCandidate(s.listing, s.score)),
    dates,
    proposalMessage: draft.message,
    proposalMessageSource: draft.source,
    experiences,
    services,
    addOns,
    interpreted,
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
