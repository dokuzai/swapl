// Postcard DSL — describes a city cover that the renderer composes layer-by-layer.
// Stays a value object so it can be cached in the DB and passed through DTOs.

import type { Palette } from "@/components/illustrations";

export const SKY_KINDS = ["dawn", "day", "dusk", "night"] as const;
export type Sky = (typeof SKY_KINDS)[number];

export const GROUND_KINDS = ["street", "water", "sand", "grass", "snow"] as const;
export type Ground = (typeof GROUND_KINDS)[number];

// Order matters here: the AI prompt embeds this exact list as the allowed
// vocabulary, and the renderer in components/illustrations/postcard.tsx
// renders unknown types as a no-op so old-format postcards never throw.
export const POSTCARD_ELEMENTS = [
  // Istanbul
  "hagia-sophia",
  "blue-mosque",
  "galata-tower",
  "bosphorus-bridge",
  // Paris
  "eiffel",
  "arc-de-triomphe",
  "sacre-coeur",
  // London
  "big-ben",
  "tower-bridge",
  // Tokyo
  "tokyo-tower",
  "pagoda",
  "mount-fuji",
  "torii-gate",
  // Amsterdam
  "canal-houses",
  "windmill",
  "tulip-row",
  // Lisbon
  "april-25-bridge",
  "tram-28",
  "rowhouse",
  "azulejo-tower",
  // CDMX
  "mexico-cathedral",
  "step-pyramid",
  "agave",
  // Brooklyn / NYC
  "brooklyn-bridge",
  "manhattan-skyline",
  "statue-of-liberty",
  "brownstone",
  // Marrakesh
  "koutoubia",
  "riad-arch",
  "palm",
  // Berlin
  "brandenburger-tor",
  "tv-tower",
  "reichstag-dome",
  // Seoul
  "gyeongbokgung",
  "namsan-tower",
  "bukhansan",
  // Generics — fallback / decorative for unknown cities
  "mountain-range",
  "skyscraper",
  "dome",
  "minaret",
  "lighthouse",
  "bridge-arch",
  "clock-tower",
  "rowhouse-stack",
  "palm-row",
  "sailboat",
  "hill",
  "fortress",
  "cypress-tree",
  "olive-tree",
  "cathedral-spire",
] as const;
export type PostcardElement = (typeof POSTCARD_ELEMENTS)[number];

export type PostcardElementInstance = {
  type: PostcardElement;
  x?: number; // 0..1 fraction of width, defaults to 0.5
  scale?: number; // 0.5..1.6, default 1
  flip?: boolean;
};

export type Postcard = {
  palette: Palette;
  sky: Sky;
  ground: Ground;
  elements: PostcardElementInstance[];
  stamp?: string; // city name shown in the postcard stamp; falls back to listing.city
};

export function isPostcard(v: unknown): v is Postcard {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Postcard>;
  return (
    typeof p.palette === "string" &&
    typeof p.sky === "string" &&
    typeof p.ground === "string" &&
    Array.isArray(p.elements)
  );
}

export function safeParsePostcard(raw: string | null | undefined): Postcard | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPostcard(parsed)) return null;
    // Filter out unknown element types so adding new ones doesn't blow up old data.
    const elements = parsed.elements.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        (POSTCARD_ELEMENTS as readonly string[]).includes(e.type)
    );
    return { ...parsed, elements };
  } catch {
    return null;
  }
}
