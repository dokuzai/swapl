// AI feature valuation (DOK-163).
//
// Given a home's characteristics (photos count, amenities, description,
// spaceType, size, sleeps) the AI proposes a small, BOUNDED "feature bonus" in
// Keys — a quality/appeal signal layered on top of the deterministic base. It
// is clamped hard (±AI_FEATURE_BONUS_MAX) so the AI can nudge but never swing a
// value, and it returns a structured explanation (factors + weights) for the
// "how is this calculated" UI.
//
// Env-gated like every other AI module: with no resolvable key, fallback()
// returns a zero bonus + a deterministic explanation, so the engine degrades to
// the pure deterministic value. NEVER called on a read path — the valuation
// cron persists the result (see lib/keys/valuation.ts).

import { resolveAIConfig, chat, type ResolveOptions } from "./providers";

// Hard clamp on the AI contribution, in Keys. Small by design: the AI refines,
// it does not price.
export const AI_FEATURE_BONUS_MAX = 3;
export const AI_FEATURE_BONUS_MIN = -2;

export type ListingFeatureInput = {
  city: string;
  country?: string;
  spaceType: string; // entire_place | private_room
  sizeSqm: number;
  sleeps: number;
  photoCount: number;
  amenities: string[]; // human labels, e.g. ["Balcony", "Pool"]
  description: string;
};

export type ValuationFactor = {
  /** Stable key for the UI, e.g. "amenities", "photos", "ai_appeal". */
  key: string;
  /** Human label. */
  label: string;
  /** Signed Keys contribution of this factor. */
  points: number;
};

export type AIFeatureValuation = {
  /** Bounded AI feature bonus in Keys (clamped to [MIN, MAX]). */
  bonus: number;
  /** One-line, member-facing rationale. */
  summary: string;
  /** Per-factor breakdown the AI considered (already reflected in `bonus`). */
  factors: ValuationFactor[];
  source: "ai" | "fallback";
};

function clampBonus(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(AI_FEATURE_BONUS_MIN, Math.min(AI_FEATURE_BONUS_MAX, n));
}

const SYSTEM_PROMPT = `You appraise the *relative appeal* of a home-swap listing for a travel-points marketplace called swapl. Points are not money.

You are given structured facts about ONE home. Return a small bounded "feature bonus" in Keys that reflects how appealing/well-presented the home is COMPARED TO A TYPICAL listing of the same size — NOT its absolute size or city (those are scored separately). Reward: rich amenities, strong photo coverage, a vivid honest description, a whole-home offer. Penalize: no photos, thin description.

Reply ONLY with strict JSON:
{ "bonus": <number between -2 and 3>, "summary": "<one short sentence>", "factors": [ { "key": "<slug>", "label": "<short>", "points": <number> } ] }

Rules:
- bonus MUST be within [-2, 3]. Keep it modest; most homes are near 0.
- factors should sum roughly to bonus and each be small (-2..+2).
- No prices, no currency, no hype words.`;

export async function valuateListingFeatures(
  input: ListingFeatureInput,
  opts: ResolveOptions = {},
): Promise<AIFeatureValuation> {
  const config = resolveAIConfig(opts);
  if (!config) return fallback(input);

  const userPrompt = JSON.stringify({
    city: input.city,
    country: input.country,
    spaceType: input.spaceType,
    sizeSqm: input.sizeSqm,
    sleeps: input.sleeps,
    photoCount: input.photoCount,
    amenities: input.amenities,
    description: input.description.slice(0, 1200),
  });

  try {
    const text = await chat({
      config,
      responseJson: true,
      maxTokens: 350,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(extractJson(text)) as {
      bonus?: unknown;
      summary?: unknown;
      factors?: unknown;
    };
    const bonus = clampBonus(Number(parsed.bonus));
    const factors = normalizeFactors(parsed.factors);
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 160)
        : describeBonus(bonus);
    return { bonus, summary, factors, source: "ai" };
  } catch (err) {
    console.error("[ai:listing-valuation]", err);
    return fallback(input);
  }
}

function normalizeFactors(raw: unknown): ValuationFactor[] {
  if (!Array.isArray(raw)) return [];
  const out: ValuationFactor[] = [];
  for (const f of raw.slice(0, 6)) {
    if (!f || typeof f !== "object") continue;
    const rec = f as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.slice(0, 40) : "factor";
    const label = typeof rec.label === "string" ? rec.label.slice(0, 60) : key;
    const points = Number(rec.points);
    if (!Number.isFinite(points)) continue;
    out.push({ key, label, points: Math.max(-2, Math.min(2, points)) });
  }
  return out;
}

// Deterministic fallback: a transparent, rule-based appeal signal from the same
// inputs, so "no AI key" == "no surprises" while still rewarding completeness.
function fallback(input: ListingFeatureInput): AIFeatureValuation {
  const factors: ValuationFactor[] = [];

  // Photos: 0 → penalty, 5+ → small reward.
  let photoPts = 0;
  if (input.photoCount === 0) photoPts = -1;
  else if (input.photoCount >= 5) photoPts = 1;
  if (photoPts !== 0) factors.push({ key: "photos", label: "Photo coverage", points: photoPts });

  // Amenities: +1 for a rich set (>=6 listed amenities).
  if (input.amenities.length >= 6) {
    factors.push({ key: "amenities", label: "Rich amenities", points: 1 });
  }

  // Description: penalize a thin one, reward a substantial one.
  const len = input.description.trim().length;
  let descPts = 0;
  if (len < 80) descPts = -1;
  else if (len >= 400) descPts = 1;
  if (descPts !== 0) factors.push({ key: "description", label: "Description depth", points: descPts });

  const bonus = clampBonus(factors.reduce((s, f) => s + f.points, 0));
  return { bonus, summary: describeBonus(bonus), factors, source: "fallback" };
}

function describeBonus(bonus: number): string {
  if (bonus > 0) return "Well-presented home with above-average appeal.";
  if (bonus < 0) return "Listing could be improved with more photos or detail.";
  return "Typical presentation for a home of this size.";
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
