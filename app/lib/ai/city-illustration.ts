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

  const generics: PostcardElement[] = [
    "skyscraper",
    "dome",
    "minaret",
    "lighthouse",
    "bridge-arch",
    "clock-tower",
    "rowhouse-stack",
    "mountain-range",
    "palm-row",
    "fortress",
    "cathedral-spire",
  ];
  const a = generics[(h >>> 12) % generics.length];
  const b = generics[(h >>> 16) % generics.length];
  const c = generics[(h >>> 20) % generics.length];
  const elements: PostcardElementInstance[] = [
    { type: a, x: 0.22, scale: 0.95 },
    { type: b, x: 0.55, scale: 1.05 },
  ];
  if (c !== a && c !== b) elements.push({ type: c, x: 0.85, scale: 0.95 });

  const postcard: Postcard = { palette, sky, ground, elements, stamp: city };
  return { city, country, palette, motif: motifFromPostcard(postcard), postcard, source: "fallback" };
}

const SYSTEM_PROMPT = `You design swapl postcards. Each postcard is a flat geometric SVG composition that should evoke a city's history, architecture, and silhouette so a viewer recognizes the city instantly.

Reply ONLY with strict JSON (no prose, no markdown), shape:
{
  "palette": "warm" | "cool" | "rose" | "sage" | "dusk" | "sand" | "mono",
  "sky":     "dawn" | "day" | "dusk" | "night",
  "ground":  "street" | "water" | "sand" | "grass" | "snow",
  "elements":[ { "type": <one of the allowed element types>, "x": 0..1, "scale": 0.7..1.3 } ],
  "stamp":   "<short uppercase city name>"
}

Pick 3–5 elements layered back-to-front. Lower x = left side. Use the most iconic landmarks first if they exist in the allowed vocabulary; otherwise pick generic elements (skyscraper, dome, minaret, mountain-range, palm-row, bridge-arch, clock-tower, lighthouse, rowhouse-stack, fortress, cathedral-spire) that match the city's character.

Allowed element types: ${POSTCARD_ELEMENTS.join(", ")}.

Examples:
- Istanbul → palette warm, sky dawn, ground water, elements: bosphorus-bridge, hagia-sophia, galata-tower, sailboat
- Paris → palette sand, sky dawn, ground street, elements: sacre-coeur, eiffel, arc-de-triomphe
- Tokyo → palette rose, sky dusk, ground street, elements: mount-fuji, tokyo-tower, pagoda
- Sydney → palette cool, sky day, ground water, elements: bridge-arch, dome, sailboat, lighthouse
- Marrakesh → palette warm, sky day, ground sand, elements: palm, koutoubia, riad-arch, palm`;

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
    decision = deterministic(city, country);
  } else {
    try {
      const text = await chat({
        config,
        responseJson: true,
        maxTokens: 600,
        temperature: 0.5,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `City: ${city}${country ? `, ${country}` : ""}. Design the postcard. Reply with JSON only.`,
          },
        ],
      });
      const candidate = JSON.parse(extractJson(text));
      const postcard = sanitizePostcard(candidate, city);
      decision = {
        city,
        country,
        palette: postcard.palette,
        motif: motifFromPostcard(postcard),
        postcard,
        source: "ai",
      };
    } catch (err) {
      console.error("[ai:postcard]", err);
      decision = deterministic(city, country);
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
  const stamp = stampRaw.slice(0, 16);

  return {
    palette,
    sky,
    ground,
    elements: elements.length ? elements : fallback.elements,
    stamp,
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

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
