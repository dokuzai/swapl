// Personalised "homes you'd love" suggestions.
//
// Strategy:
//   1. Pre-rank a candidate pool with the existing match-score algorithm.
//   2. Hand the top N to the configured AI provider with the user's listing
//      context, asking it to pick 3 with a one-sentence personal reason.
//   3. If no AI is configured, just return the top 3 by score with a
//      templated reason — same shape, no degradation in the UI.

import { prisma } from "@/lib/db";
import { toDTO, type ListingDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
import { resolveAIConfig, chat } from "./providers";

export type SwapSuggestion = {
  listing: ListingDTO;
  matchScore: number;
  reason: string;
  source: "ai" | "fallback";
};

export type SuggestionsContext = {
  userId: string;
  userOverride?: { provider?: string | null; model?: string | null; apiKey?: string | null };
};

const POOL_SIZE = 12;
const PICK_COUNT = 3;

export async function getSuggestionsForUser(ctx: SuggestionsContext): Promise<SwapSuggestion[]> {
  // 1. Find the user's most recent listing — that's their "home" for matching.
  const mine = await prisma.listing.findFirst({
    where: { userId: ctx.userId, isActive: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!mine) return [];

  const myDto = toDTO(mine);

  // 2. Pull a candidate pool that excludes my own listings.
  const candidates = await prisma.listing.findMany({
    where: { isActive: true, ineligibleReason: null, NOT: { userId: ctx.userId } },
    include: { user: { select: { name: true } } },
    take: 60,
  });

  const scored = candidates
    .map((l) => {
      const dto = toDTO(l);
      const score = computeMatchScore(
        toScoreable(myDto),
        toScoreable(dto)
      );
      return { dto, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, POOL_SIZE);

  // 3. Either ask AI or fall back.
  const config = resolveAIConfig({ userOverride: ctx.userOverride });
  if (!config) {
    return scored.slice(0, PICK_COUNT).map((s) => ({
      listing: s.dto,
      matchScore: s.score,
      reason: fallbackReason(myDto, s.dto, s.score),
      source: "fallback",
    }));
  }

  try {
    const text = await chat({
      config,
      responseJson: true,
      maxTokens: 500,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "You're swapl's recommendation engine. Given the user's home and a list of swap candidates, pick the 3 best matches and write a one-sentence personal reason for each. " +
            "Reply ONLY with strict JSON of the shape: " +
            `{"picks":[{"id":"<listingId>","reason":"…"},…]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            yourHome: shrinkForPrompt(myDto),
            candidates: scored.map((s) => shrinkForPrompt(s.dto)),
          }),
        },
      ],
    });
    const parsed = JSON.parse(extractJson(text)) as { picks: Array<{ id: string; reason: string }> };
    const byId = new Map(scored.map((s) => [s.dto.id, s]));
    const seen = new Set<string>();
    const out: SwapSuggestion[] = [];
    for (const p of parsed.picks ?? []) {
      const hit = byId.get(p.id);
      if (!hit || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({
        listing: hit.dto,
        matchScore: hit.score,
        reason: typeof p.reason === "string" ? p.reason.slice(0, 240) : fallbackReason(myDto, hit.dto, hit.score),
        source: "ai",
      });
      if (out.length >= PICK_COUNT) break;
    }
    if (out.length === 0) throw new Error("AI returned no usable picks");
    return out;
  } catch (err) {
    console.error("[ai:suggestions]", err);
    return scored.slice(0, PICK_COUNT).map((s) => ({
      listing: s.dto,
      matchScore: s.score,
      reason: fallbackReason(myDto, s.dto, s.score),
      source: "fallback",
    }));
  }
}

function toScoreable(d: ListingDTO) {
  return {
    sizeSqm: d.sizeSqm,
    sleeps: d.sleeps,
    availableFrom: new Date(d.availableFrom),
    availableTo: new Date(d.availableTo),
    petsAllowed: d.petsAllowed,
    wfhSetup: d.wfhSetup,
    stepFreeAccess: d.stepFreeAccess,
    city: d.city,
    neighbourhood: d.neighbourhood,
  };
}

function shrinkForPrompt(d: ListingDTO) {
  return {
    id: d.id,
    title: d.title,
    city: d.city,
    neighbourhood: d.neighbourhood,
    country: d.country,
    propertyType: d.propertyType,
    sizeSqm: d.sizeSqm,
    sleeps: d.sleeps,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    petsAllowed: d.petsAllowed,
    wfhSetup: d.wfhSetup,
    stepFreeAccess: d.stepFreeAccess,
    availableFrom: d.availableFrom.slice(0, 10),
    availableTo: d.availableTo.slice(0, 10),
    amenities: {
      balcony: d.balcony,
      rooftop: d.rooftop,
      garden: d.garden,
      pool: d.pool,
      piano: d.piano,
      bikeIncluded: d.bikeIncluded,
    },
  };
}

function fallbackReason(mine: ListingDTO, theirs: ListingDTO, score: number): string {
  const reasons: string[] = [];
  if (mine.sleeps === theirs.sleeps) reasons.push(`sleeps the same (${theirs.sleeps})`);
  else if (Math.abs(mine.sleeps - theirs.sleeps) === 1) reasons.push(`sleeps almost the same`);
  if (mine.wfhSetup && theirs.wfhSetup) reasons.push(`WFH-ready`);
  if (mine.petsAllowed && theirs.petsAllowed) reasons.push(`pets welcome both ways`);
  const sizeRatio = Math.min(mine.sizeSqm, theirs.sizeSqm) / Math.max(mine.sizeSqm, theirs.sizeSqm);
  if (sizeRatio > 0.8) reasons.push(`comparable size`);
  if (reasons.length === 0) reasons.push(`overlapping availability`);
  return `${score}% match — ${reasons.join(", ")}.`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
