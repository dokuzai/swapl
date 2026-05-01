// AI-driven city postcard generator.
//
// Resolves a Postcard for any city in this priority order:
//   1. Hand-crafted preset (10 seeded cities — always recognizable, no API call)
//   2. DB cache on CityArt.postcard
//   3. Configured AI provider (per-user override → env-wide default)
//   4. Deterministic fallback that picks a palette + 2 generic landmarks
//
// The output is *always* a Postcard plus the legacy palette+motif tuple kept
// for backward-compat with code paths that haven't been migrated yet.

import { prisma } from "@/lib/db";
import { paletteForCity, CITIES } from "@/lib/cities";
import { resolveAIConfig, chat, type ResolveOptions } from "./providers";
import {
  POSTCARD_ELEMENTS,
  SKY_KINDS,
  GROUND_KINDS,
  type Postcard,
  type PostcardElement,
  type PostcardElementInstance,
  type Sky,
  type Ground,
  isPostcard,
  safeParsePostcard,
} from "./postcard-types";
import { presetFor } from "./postcard-presets";
import type { Palette } from "@/components/illustrations";

export const VALID_PALETTES = ["warm", "cool", "rose", "sage", "dusk", "sand", "mono"] as const;

// Legacy motif vocabulary — kept so the listing detail page's old chips still resolve.
export const VALID_MOTIFS = [
  "minaret", "dome", "skyscraper", "palm", "canal", "mountain",
  "bridge", "pagoda", "lighthouse", "windmill",
] as const;
export type CityMotif = (typeof VALID_MOTIFS)[number];

export type CityArtDecision = {
  city: string;
  country: string | null;
  palette: Palette;
  motif: CityMotif[];
  postcard: Postcard;
  source: "ai" | "fallback" | "preset" | "cache";
  // Filled when the AI path was attempted but degraded to fallback. Surfaced
  // to the API only when ?debug=1 is set + caller is admin.
  aiError?: string;
};

function presetDecision(city: string): CityArtDecision | null {
  const preset = presetFor(city);
  const meta = CITIES.find((c) => c.name.toLowerCase() === city.toLowerCase());
  if (!preset) return null;
  return {
    city: meta?.name ?? city,
    country: meta?.country ?? null,
    palette: preset.palette,
    motif: motifFromPostcard(preset),
    postcard: { ...preset, stamp: preset.stamp ?? meta?.name ?? city },
    source: "preset",
  };
}

// Distil a Postcard back down to a few legacy motif keywords for the
// listing-detail "chips" view that hasn't been migrated.
function motifFromPostcard(p: Postcard): CityMotif[] {
  const map: Partial<Record<PostcardElement, CityMotif>> = {
    "hagia-sophia": "dome",
    "blue-mosque": "dome",
    "galata-tower": "minaret",
    "bosphorus-bridge": "bridge",
    eiffel: "skyscraper",
    "arc-de-triomphe": "dome",
    "sacre-coeur": "dome",
    "big-ben": "minaret",
    "tower-bridge": "bridge",
    "tokyo-tower": "skyscraper",
    pagoda: "pagoda",
    "mount-fuji": "mountain",
    "torii-gate": "minaret",
    "canal-houses": "canal",
    windmill: "windmill",
    "april-25-bridge": "bridge",
    "tram-28": "minaret",
    rowhouse: "dome",
    "azulejo-tower": "minaret",
    "mexico-cathedral": "dome",
    "step-pyramid": "mountain",
    "brooklyn-bridge": "bridge",
    "manhattan-skyline": "skyscraper",
    "statue-of-liberty": "lighthouse",
    brownstone: "dome",
    koutoubia: "minaret",
    "riad-arch": "dome",
    palm: "palm",
    "brandenburger-tor": "dome",
    "tv-tower": "lighthouse",
    "reichstag-dome": "dome",
    gyeongbokgung: "dome",
    "namsan-tower": "lighthouse",
    bukhansan: "mountain",
    "mountain-range": "mountain",
    skyscraper: "skyscraper",
    dome: "dome",
    minaret: "minaret",
    lighthouse: "lighthouse",
    "bridge-arch": "bridge",
    "clock-tower": "minaret",
    "rowhouse-stack": "dome",
    "palm-row": "palm",
    sailboat: "lighthouse",
    fortress: "dome",
    "cathedral-spire": "minaret",
  };
  const out = new Set<CityMotif>();
  for (const e of p.elements) {
    const m = map[e.type];
    if (m) out.add(m);
    if (out.size >= 3) break;
  }
  return [...out];
}

// Deterministic fallback: pick a palette + 2-3 generic elements based on a hash
// of the city name. Identical input always returns the identical postcard.
function deterministic(city: string, country: string | null): CityArtDecision {
  let h = 0;
  const key = (city + (country ?? "")).toLowerCase();
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
  const palette = VALID_PALETTES[h % VALID_PALETTES.length] as Palette;
  const sky = SKY_KINDS[(h >>> 4) % SKY_KINDS.length];
  const ground = GROUND_KINDS[(h >>> 8) % GROUND_KINDS.length];

  // Curated layer pools so the deterministic fallback still produces a
  // back-to-front composition rather than a flat row of three buildings.
  const backgrounds: PostcardElement[] = ["mountain-range", "hill", "fortress"];
  const heroes: PostcardElement[] = [
    "dome", "minaret", "skyscraper", "clock-tower", "cathedral-spire",
    "duomo-dome", "siena-tower", "shanghai-pearl", "marina-bay-sands",
  ];
  const supports: PostcardElement[] = [
    "rowhouse-stack", "lighthouse", "bridge-arch",
    "alpine-chalet", "santorini-domes", "egyptian-pyramid",
  ];
  const foregrounds: PostcardElement[] = [
    "palm-row", "palm", "vespa", "bicycle-leaning", "fishing-boat",
    "trolley-cable-car", "double-decker-bus", "cherry-blossoms",
    "stoop-with-railings", "sailboat",
  ];

  const bg = backgrounds[(h >>> 12) % backgrounds.length];
  const hero = heroes[(h >>> 16) % heroes.length];
  const support = supports[(h >>> 20) % supports.length];
  const foreground = foregrounds[(h >>> 24) % foregrounds.length];

  const elements: PostcardElementInstance[] = [
    { type: bg, x: 0.22, scale: 1.05 },
    { type: hero, x: 0.55, scale: 1.2 },
    { type: support, x: 0.84, scale: 0.95 },
    { type: foreground, x: 0.18, scale: 0.85 },
  ];

  const weather: Postcard["weather"] = sky === "night" ? "clear" : ((h >>> 28) % 3 === 0 ? "cloudy" : "clear");

  const postcard: Postcard = {
    palette, sky, ground, elements,
    stamp: city,
    country: country ?? undefined,
    weather,
  };
  return { city, country, palette, motif: motifFromPostcard(postcard), postcard, source: "fallback" };
}

const SYSTEM_PROMPT = `You design swapl postcards. Each postcard is a flat geometric SVG composition that must instantly read as the named city. Imagine a 1960s-style travel postcard: clear silhouette, three or four iconic shapes, atmospheric depth.

Reply ONLY with strict JSON (no prose, no markdown), shape:
{
  "palette":  "warm" | "cool" | "rose" | "sage" | "dusk" | "sand" | "mono",
  "sky":      "dawn" | "day" | "dusk" | "night",
  "ground":   "street" | "water" | "sand" | "grass" | "snow",
  "weather":  "clear" | "cloudy" | "misty",
  "elements": [ { "type": <one of the allowed element types>, "x": 0..1, "scale": 0.7..1.4 } ],
  "stamp":    "<short uppercase city name, max 12 chars>",
  "country":  "<short uppercase country name, max 13 chars>"
}

Composition rules:
- Pick 4–6 elements arranged back-to-front (first item drawn first).
- Use 1 background element (mountain-range, hill, bukhansan, mount-fuji, fortress) at scale 1.0–1.2 and x≈0.15–0.3 OR x≈0.7–0.85.
- Use 1 hero landmark — the city's most iconic structure if present in the vocabulary — at scale 1.05–1.4 around x=0.5.
- Use 1 supporting landmark (different size/shape, not duplicating the hero) on the opposite side.
- Use 1 foreground detail (vespa, gondola, bicycle-leaning, cherry-blossoms, palm, sailboat, fishing-boat, stoop-with-railings, trolley-cable-car, double-decker-bus) at scale 0.75–1.0 close to a corner.
- Optional: a hot-air-balloon, plane-trail or cloud-mood for character.
- Never repeat the same element type twice with x within 0.2 of each other.

Region cues for palette + sky + ground:
- Mediterranean (Athens, Rome, Lisbon, Barcelona, Florence, Naples) → palette sand, sky day or dawn, ground street or water, weather clear.
- Northern Europe (Copenhagen, Stockholm, Oslo, Berlin, Amsterdam) → palette cool, sky day, ground water or street, weather cloudy.
- Tropical / coastal (Rio, Honolulu, Cape Town, Lisbon coast) → palette warm or sand, sky day or dawn, ground sand or water.
- East Asia (Tokyo, Kyoto, Seoul, Shanghai, Hong Kong, Singapore) → palette rose or dusk, sky dusk, ground street or water.
- South Asia (Delhi, Mumbai, Jaipur) → palette warm or sand, sky day, ground sand or street.
- Latin America (CDMX, Buenos Aires) → palette sage or warm, sky day, ground street.
- Middle East / North Africa (Marrakesh, Cairo, Istanbul-Asia-side, Doha) → palette warm or sand, sky day or dawn, ground sand.
- Cold-weather (Reykjavík, Helsinki, Innsbruck, Zermatt) → palette mono or cool, sky day, ground snow, weather misty.

Allowed element types: ${POSTCARD_ELEMENTS.join(", ")}.

Examples — these are the *target* density and composition:
- Istanbul, Türkiye → palette warm, sky dawn, ground water, weather clear, elements: [hill, bosphorus-bridge, hagia-sophia, galata-tower, sailboat, fishing-boat], stamp ISTANBUL, country TÜRKİYE.
- Paris, France → palette sand, sky dawn, ground street, weather clear, elements: [sacre-coeur, arc-de-triomphe, eiffel, vespa, plane-trail], stamp PARIS, country FRANCE.
- Tokyo, Japan → palette rose, sky dusk, ground street, weather clear, elements: [mount-fuji, tokyo-tower, pagoda, cherry-blossoms, bicycle-leaning], stamp TOKYO, country JAPAN.
- Sydney, Australia → palette cool, sky day, ground water, weather cloudy, elements: [hill, opera-house-sails, bridge-arch, sailboat, fishing-boat], stamp SYDNEY, country AUSTRALIA.
- Rome, Italy → palette sand, sky day, ground street, weather clear, elements: [hill, fortress, dome, duomo-dome, vespa], stamp ROMA, country ITALIA.
- Venice, Italy → palette sand, sky dawn, ground water, weather misty, elements: [siena-tower, dome, bridge-arch, gondola, gondola], stamp VENEZIA, country ITALIA.
- Rio, Brazil → palette warm, sky dawn, ground water, weather clear, elements: [hill, christ-redeemer, palm-row, fishing-boat, palm], stamp RIO, country BRASIL.
- Cairo, Egypt → palette sand, sky day, ground sand, weather clear, elements: [egyptian-pyramid, egyptian-pyramid, minaret, palm, hot-air-balloon], stamp CAIRO, country EGYPT.
- Singapore → palette cool, sky dusk, ground water, weather clear, elements: [marina-bay-sands, skyscraper, bridge-arch, sailboat, palm], stamp SINGAPORE, country SINGAPORE.
- New York → palette dusk, sky dusk, ground water, weather clear, elements: [manhattan-skyline, statue-of-liberty, brooklyn-bridge, sailboat, plane-trail], stamp NEW YORK, country USA.

Voice for the stamp: ALL CAPS, native short form when there is one (PARIS, ROMA, VENEZIA, BRASIL, NIPPON, ESPAÑA). For country, use the spoken English form unless the native form is recognisably international (ITALIA, BRASIL, NIPPON OK; otherwise USA, FRANCE, JAPAN).`;

export async function generateCityPostcard(
  rawCity: string,
  rawCountry?: string,
  resolveOpts: ResolveOptions = {}
): Promise<CityArtDecision> {
  const city = rawCity.trim();
  const country = rawCountry?.trim() || null;
  if (!city) throw new Error("city required");

  // 1. Preset
  const fromPreset = presetDecision(city);
  if (fromPreset) return fromPreset;

  // 2. Cache (CityArt.postcard)
  const cached = await prisma.cityArt.findUnique({ where: { city } });
  const cachedPostcard = safeParsePostcard(cached?.postcard ?? null);
  if (cached && cachedPostcard) {
    return {
      city: cached.city,
      country: cached.country,
      palette: cachedPostcard.palette,
      motif: motifFromPostcard(cachedPostcard),
      postcard: cachedPostcard,
      source: "cache",
    };
  }

  // 3. AI
  const config = resolveAIConfig(resolveOpts);
  let decision: CityArtDecision;
  if (!config) {
    console.warn(`[ai:postcard] no provider configured — falling back for ${city}`);
    decision = deterministic(city, country);
  } else {
    try {
      console.log(`[ai:postcard] requesting ${city} via ${config.provider}/${config.model}`);
      const text = await chat({
        config,
        responseJson: true,
        maxTokens: 700,
        temperature: 0.5,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `City: ${city}${country ? `, ${country}` : ""}. Design the postcard. Reply with the JSON object only — no prose, no markdown fences.`,
          },
        ],
      });
      let candidate: unknown;
      try {
        candidate = JSON.parse(extractJson(text));
      } catch (parseErr) {
        console.error(
          `[ai:postcard] JSON parse failed for ${city}: ${(parseErr as Error).message}; first 200 chars of output: ${text.slice(0, 200)}`,
        );
        throw parseErr;
      }
      const postcard = sanitizePostcard(candidate, city);
      // If sanitisePostcard had to substitute the fallback elements (which
      // happens when the AI returned nothing usable), tag the source as
      // fallback so callers can tell the AI succeeded structurally but
      // produced nothing renderable.
      const fellBackOnElements =
        postcard.elements === deterministic(city, country).postcard.elements;
      decision = {
        city,
        country,
        palette: postcard.palette,
        motif: motifFromPostcard(postcard),
        postcard,
        source: fellBackOnElements ? "fallback" : "ai",
      };
      console.log(`[ai:postcard] ${city}: source=${decision.source}, elements=${postcard.elements.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ai:postcard] ${city} failed:`, msg);
      decision = { ...deterministic(city, country), aiError: msg };
    }
  }

  // 4. Cache
  await prisma.cityArt.upsert({
    where: { city },
    create: {
      city,
      country,
      palette: decision.palette,
      motif: decision.motif.join(","),
      postcard: JSON.stringify(decision.postcard),
      source: decision.source,
    },
    update: {
      country,
      palette: decision.palette,
      motif: decision.motif.join(","),
      postcard: JSON.stringify(decision.postcard),
      source: decision.source,
    },
  });

  return decision;
}

// Coerce arbitrary AI output into a Postcard, dropping unknown fields and
// clipping numeric ranges so a misbehaving model can't break the renderer.
function sanitizePostcard(raw: unknown, city: string): Postcard {
  const fallback = deterministic(city, null).postcard;
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;

  const palette = (VALID_PALETTES as readonly string[]).includes(String(r.palette))
    ? (r.palette as Palette)
    : fallback.palette;
  const sky = (SKY_KINDS as readonly string[]).includes(String(r.sky))
    ? (r.sky as Sky)
    : fallback.sky;
  const ground = (GROUND_KINDS as readonly string[]).includes(String(r.ground))
    ? (r.ground as Ground)
    : fallback.ground;

  const elements: PostcardElementInstance[] = Array.isArray(r.elements)
    ? r.elements
        .map((e: unknown): PostcardElementInstance | null => {
          if (!e || typeof e !== "object") return null;
          const it = e as Record<string, unknown>;
          if (!(POSTCARD_ELEMENTS as readonly string[]).includes(String(it.type))) return null;
          return {
            type: it.type as PostcardElement,
            x: typeof it.x === "number" ? Math.max(0, Math.min(1, it.x)) : 0.5,
            scale: typeof it.scale === "number" ? Math.max(0.5, Math.min(1.6, it.scale)) : 1,
            flip: it.flip === true,
          };
        })
        .filter((e): e is PostcardElementInstance => e !== null)
        .slice(0, 6)
    : [];

  const stampRaw = typeof r.stamp === "string" ? r.stamp : city;
  const stamp = stampRaw.slice(0, 14);

  const countryRaw = typeof r.country === "string" ? r.country.trim() : "";
  const countryOut = countryRaw ? countryRaw.slice(0, 14) : undefined;

  const weatherRaw = typeof r.weather === "string" ? r.weather : "clear";
  const weather: Postcard["weather"] = weatherRaw === "cloudy" || weatherRaw === "misty" ? weatherRaw : "clear";

  return {
    palette,
    sky,
    ground,
    elements: elements.length ? elements : fallback.elements,
    stamp,
    country: countryOut,
    weather,
  };
}

// Backward-compat alias used by existing call sites.
export const generateCityArt = generateCityPostcard;

export function parseMotif(raw: string | null | undefined): CityMotif[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CityMotif => (VALID_MOTIFS as readonly string[]).includes(s));
}

export { isPostcard, safeParsePostcard };

// Tolerates Kimi/OpenAI/Anthropic outputs that wrap the JSON in markdown
// fences ("```json ...```"), prose ("Sure! Here is..."), or trailing text.
function extractJson(text: string): string {
  if (!text) return "{}";
  // 1. Strip ```json or ``` fences if present.
  let t = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  // 2. Find the outermost balanced { ... } block.
  const start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  // Unbalanced — fall through to a regex match for anything that looks like
  // a JSON object so JSON.parse at least gets a chance.
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}
