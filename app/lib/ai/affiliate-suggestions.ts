// Maps a user's profile interests to concrete bookable activities for the
// destination city of a confirmed swap, returned as ready-to-render cards
// that point at the existing /api/affiliate/[partnerSlug] redirector so
// click attribution flows through unchanged.
//
// AI path: lets the model pick the search query and the partner. Falls back
// to a deterministic tag→partner map when no AI is configured.

import { resolveAIConfig, chat, type ResolveOptions } from "./providers";
import type { InterestTag } from "@/lib/interests";

export type AffiliatePartnerSlug = "skyscanner" | "airalo" | "getyourguide" | "battleface";

export type AffiliateSuggestion = {
  partner: AffiliatePartnerSlug;
  title: string;        // headline shown on the card
  reason: string;       // one-sentence rationale referencing the interest
  searchQuery?: string; // appended to the redirector as a `q=` so partner-side
                        // search matches what the AI actually had in mind.
};

export type AffiliateBundle = {
  items: AffiliateSuggestion[];
  source: "ai" | "fallback";
};

const SYSTEM_PROMPT = `You're swapl's recommendation engine. Given a user's profile interests and the city they're swapping into, recommend up to 4 bookable activities or services from a fixed partner list.

Reply ONLY with strict JSON of the shape:
{ "items": [ { "partner": "skyscanner|airalo|getyourguide|battleface", "title": "<= 60 chars", "reason": "<= 140 chars referencing the interest", "searchQuery": "<= 60 chars" } ] }

Rules:
- Each suggestion must reference at least one of the user's interests by name.
- "title" should be concrete (e.g. "Vinyl-shop walking tour, Shibuya", not "Music tour").
- Pick "getyourguide" for any in-destination activity (food, museums, tours, hikes, classes).
- Pick "airalo" only if the user listed "Working from there" or "Coworking spaces".
- Pick "skyscanner" only if interests suggest international hops worth flying for (e.g. "Hiking" + a mountainous nearby city).
- Pick "battleface" only if the user has no extant insurance upgrade and travels with sports gear or extended stays.
- searchQuery is the exact text we'll feed the partner's search box.
- No emoji, no marketing language, no exclamation marks.`;

const FALLBACK_PARTNER_BY_INTEREST: Partial<Record<string, AffiliatePartnerSlug>> = {
  // Most interests → GetYourGuide as the default
  // (overridden below for the special cases).
  wfh: "airalo",
  coworking: "airalo",
};

export async function suggestAffiliateActivities(opts: {
  city: string;
  country: string;
  interests: InterestTag[];
  resolve: ResolveOptions;
}): Promise<AffiliateBundle> {
  const config = resolveAIConfig(opts.resolve);
  if (!config || opts.interests.length === 0) return fallback(opts.city, opts.interests);

  try {
    const text = await chat({
      config,
      responseJson: true,
      maxTokens: 600,
      temperature: 0.55,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            destinationCity: opts.city,
            destinationCountry: opts.country,
            interests: opts.interests.map((t) => t.label),
          }),
        },
      ],
    });
    const parsed = JSON.parse(extractJson(text));
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 4) : [];
    const cleaned: AffiliateSuggestion[] = items
      .map((it: unknown): AffiliateSuggestion | null => {
        if (!it || typeof it !== "object") return null;
        const r = it as Record<string, unknown>;
        if (!isPartner(r.partner)) return null;
        if (typeof r.title !== "string" || r.title.length < 4) return null;
        if (typeof r.reason !== "string" || r.reason.length < 6) return null;
        return {
          partner: r.partner,
          title: r.title.slice(0, 80),
          reason: r.reason.slice(0, 200),
          searchQuery: typeof r.searchQuery === "string" ? r.searchQuery.slice(0, 80) : undefined,
        };
      })
      .filter((x: AffiliateSuggestion | null): x is AffiliateSuggestion => x !== null);
    if (cleaned.length === 0) return fallback(opts.city, opts.interests);
    return { items: cleaned, source: "ai" };
  } catch (err) {
    console.error("[ai:affiliate-suggestions]", err);
    return fallback(opts.city, opts.interests);
  }
}

function isPartner(p: unknown): p is AffiliatePartnerSlug {
  return p === "skyscanner" || p === "airalo" || p === "getyourguide" || p === "battleface";
}

function fallback(city: string, interests: InterestTag[]): AffiliateBundle {
  const items: AffiliateSuggestion[] = [];
  const seen = new Set<AffiliatePartnerSlug>();
  for (const t of interests) {
    if (items.length >= 3) break;
    const partner: AffiliatePartnerSlug = FALLBACK_PARTNER_BY_INTEREST[t.slug] ?? "getyourguide";
    if (seen.has(partner) && partner !== "getyourguide") continue;
    seen.add(partner);
    items.push({
      partner,
      title: titleFor(partner, city, t),
      reason: `Picked because you listed "${t.label}".`,
      searchQuery: `${t.label} ${city}`,
    });
  }
  if (items.length === 0) {
    items.push({
      partner: "getyourguide",
      title: `Things to do in ${city}`,
      reason: "Add some interests on /account/interests to get smarter picks.",
      searchQuery: city,
    });
  }
  return { items, source: "fallback" };
}

function titleFor(partner: AffiliatePartnerSlug, city: string, t: InterestTag): string {
  switch (partner) {
    case "airalo":
      return `Stay connected in ${city} for working remotely`;
    case "skyscanner":
      return `Day-trip flights from ${city}`;
    case "battleface":
      return `Top-up cover for ${t.label.toLowerCase()} trips`;
    case "getyourguide":
    default:
      return `${t.label} in ${city}`;
  }
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
