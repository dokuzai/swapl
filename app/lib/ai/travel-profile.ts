// AI travel preference profile (DOK-146).
//
// Privacy-first by construction: the profile is synthesised ONLY from signals
// the user created inside swapl — profile interests/bio, wishlist (Favorite),
// saved searches, and the swap messages the user wrote. Nothing is scraped
// from outside. The result is stored on TravelProfile where the user can read
// it verbatim (GET /api/assistant/profile) and delete it (DELETE).
//
// Degrades without an AI key: the deterministic path aggregates the same
// signals into traits + a readable summary, so the feature works everywhere.

import { prisma, parseJSON } from "@/lib/db";
import { resolveAIConfig, chat, type ResolveOptions } from "./providers";

export type TravelTraits = {
  /** Interest themes, e.g. ["surfing", "street-food", "museums"]. */
  themes: string[];
  /** Cities the user gravitates to (wishlist + saved searches). */
  cities: string[];
  /** One-line vibe, from the profile's bioVibe or AI synthesis. */
  vibe: string | null;
  /** Practical constraints, e.g. ["pet-friendly", "wfh", "step-free access"]. */
  constraints: string[];
};

export type TravelProfileData = {
  summary: string;
  traits: TravelTraits;
  sourcesUsed: string[];
  updatedAt: string;
};

// Last N swap messages written by the user that feed the synthesis.
const MESSAGE_SAMPLE = 20;
const MAX_LIST = 8;

type Signals = {
  interests: string[];
  bio: string | null;
  bioVibe: string | null;
  ownListing: { city: string; petsAllowed: boolean; wfhSetup: boolean; stepFreeAccess: boolean } | null;
  favorites: Array<{ city: string; country: string; tags: string[]; petsAllowed: boolean; wfhSetup: boolean; stepFreeAccess: boolean }>;
  savedSearchCities: string[];
  messages: string[];
  userOverride?: ResolveOptions["userOverride"];
};

async function collectSignals(userId: string): Promise<Signals | null> {
  const [user, ownListing, favorites, savedSearches, messages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { interests: true, bio: true, bioVibe: true, aiProvider: true, aiModel: true, aiApiKey: true },
    }),
    prisma.listing.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { city: true, petsAllowed: true, wfhSetup: true, stepFreeAccess: true },
    }),
    prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        listing: {
          select: { city: true, country: true, tags: true, petsAllowed: true, wfhSetup: true, stepFreeAccess: true },
        },
      },
    }),
    prisma.savedSearch.findMany({ where: { userId }, select: { query: true } }),
    prisma.swapMessage.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_SAMPLE,
      select: { body: true },
    }),
  ]);
  if (!user) return null;

  const savedSearchCities: string[] = [];
  for (const s of savedSearches) {
    const params = new URLSearchParams(s.query);
    const city = params.get("city");
    if (city) savedSearchCities.push(city);
  }

  return {
    interests: parseJSON<string[]>(user.interests, []),
    bio: user.bio,
    bioVibe: user.bioVibe,
    ownListing,
    favorites: favorites.map((f) => ({
      city: f.listing.city,
      country: f.listing.country,
      tags: parseJSON<string[]>(f.listing.tags, []),
      petsAllowed: f.listing.petsAllowed,
      wfhSetup: f.listing.wfhSetup,
      stepFreeAccess: f.listing.stepFreeAccess,
    })),
    savedSearchCities,
    messages: messages.map((m) => m.body.slice(0, 400)),
    userOverride: { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey },
  };
}

function rankByFrequency(values: string[], max: number): string[] {
  const counts = new Map<string, { canonical: string; count: number }>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { canonical: v.trim(), count: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((c) => c.canonical);
}

/** Deterministic synthesis — same shape as the AI path, no key required. */
export function deterministicProfile(signals: Signals): { summary: string; traits: TravelTraits } {
  const themes = rankByFrequency(
    [...signals.interests, ...signals.favorites.flatMap((f) => f.tags)],
    MAX_LIST
  );
  const cities = rankByFrequency(
    [...signals.favorites.map((f) => f.city), ...signals.savedSearchCities],
    MAX_LIST
  );

  const constraints: string[] = [];
  const half = signals.favorites.length / 2;
  const favCount = (pick: (f: Signals["favorites"][number]) => boolean) =>
    signals.favorites.filter(pick).length;
  if (signals.ownListing?.petsAllowed || (signals.favorites.length > 0 && favCount((f) => f.petsAllowed) >= half))
    constraints.push("pet-friendly");
  if (signals.ownListing?.wfhSetup || (signals.favorites.length > 0 && favCount((f) => f.wfhSetup) >= half))
    constraints.push("wfh");
  if (signals.ownListing?.stepFreeAccess || (signals.favorites.length > 0 && favCount((f) => f.stepFreeAccess) >= half))
    constraints.push("step-free access");

  const bits: string[] = [];
  if (cities.length) bits.push(`You keep coming back to ${cities.slice(0, 3).join(", ")}.`);
  if (themes.length) bits.push(`Your travel themes: ${themes.slice(0, 4).join(", ")}.`);
  if (constraints.length) bits.push(`Practical must-haves: ${constraints.join(", ")}.`);
  if (signals.bioVibe) bits.push(`Vibe: ${signals.bioVibe}`);
  const summary = bits.length
    ? bits.join(" ")
    : "Not enough in-app activity yet — favorite a few homes or save a search and refresh this profile.";

  return { summary, traits: { themes, cities, vibe: signals.bioVibe ?? null, constraints } };
}

function sourcesUsed(signals: Signals): string[] {
  const out: string[] = [];
  if (signals.interests.length || signals.bio || signals.bioVibe) out.push("interests");
  if (signals.favorites.length) out.push("favorites");
  if (signals.savedSearchCities.length) out.push("saved_searches");
  if (signals.messages.length) out.push("swap_messages");
  return out;
}

const SYSTEM_PROMPT = `You are swapl's travel-profile writer. Given a member's in-app signals (interests, bio, wishlist homes, saved searches, their own swap messages), synthesise their travel preferences.

Reply ONLY with strict JSON: {"summary":"<= 60 words, second person, warm, factual>","traits":{"themes":["…"],"cities":["…"],"vibe":"one short line or null","constraints":["e.g. pet-friendly, wfh, step-free access"]}}.

Rules: only use the provided signals — never invent cities or interests; keep arrays short (max ${MAX_LIST}); constraints are practical needs only.`;

function sanitiseStrings(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().slice(0, 60))
    .slice(0, max);
}

/**
 * Builds (or rebuilds) the user's travel profile from in-app signals and
 * upserts it on TravelProfile. AI-synthesised when a provider is configured,
 * deterministic aggregation otherwise — same output shape either way.
 */
export async function buildTravelProfile(userId: string): Promise<TravelProfileData | null> {
  const signals = await collectSignals(userId);
  if (!signals) return null;

  let { summary, traits } = deterministicProfile(signals);

  const config = resolveAIConfig({ userOverride: signals.userOverride });
  if (config) {
    try {
      const text = await chat({
        config,
        responseJson: true,
        maxTokens: 400,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              interests: signals.interests,
              bio: signals.bio,
              bioVibe: signals.bioVibe,
              wishlist: signals.favorites,
              savedSearchCities: signals.savedSearchCities,
              ownSwapMessages: signals.messages,
            }),
          },
        ],
      });
      const parsed = JSON.parse(extractJson(text)) as {
        summary?: unknown;
        traits?: { themes?: unknown; cities?: unknown; vibe?: unknown; constraints?: unknown };
      };
      if (typeof parsed.summary === "string" && parsed.summary.trim().length >= 10) {
        summary = parsed.summary.trim().slice(0, 600);
        traits = {
          themes: sanitiseStrings(parsed.traits?.themes, MAX_LIST),
          cities: sanitiseStrings(parsed.traits?.cities, MAX_LIST),
          vibe: typeof parsed.traits?.vibe === "string" ? parsed.traits.vibe.slice(0, 120) : traits.vibe,
          constraints: sanitiseStrings(parsed.traits?.constraints, MAX_LIST),
        };
      }
    } catch (err) {
      console.error("[ai:travel-profile]", err);
      // keep the deterministic synthesis
    }
  }

  const sources = sourcesUsed(signals);
  const row = await prisma.travelProfile.upsert({
    where: { userId },
    create: { userId, summary, traits: JSON.stringify(traits), sourcesUsed: JSON.stringify(sources) },
    update: { summary, traits: JSON.stringify(traits), sourcesUsed: JSON.stringify(sources) },
  });

  return { summary, traits, sourcesUsed: sources, updatedAt: row.updatedAt.toISOString() };
}

/** Reads the stored profile, or null when the user deleted it / never built one. */
export async function readTravelProfile(userId: string): Promise<TravelProfileData | null> {
  const row = await prisma.travelProfile.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    summary: row.summary,
    traits: parseJSON<TravelTraits>(row.traits, { themes: [], cities: [], vibe: null, constraints: [] }),
    sourcesUsed: parseJSON<string[]>(row.sourcesUsed, []),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
