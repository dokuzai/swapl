// SVG illustration primitives. Pure server-renderable React.

import type { CSSProperties } from "react";
import type { Postcard } from "@/lib/ai/postcard-types";
import { PostcardSvg } from "./postcard";

export type Palette =
  | "warm"   // Istanbul / Marrakesh
  | "cool"   // Amsterdam / Berlin
  | "rose"   // Tokyo
  | "sage"   // CDMX
  | "dusk"   // Brooklyn
  | "sand"   // Lisbon / Paris (warmer)
  | "mono";

const cityPalettes: Record<Palette, { sky: string; building: string; roof: string; window: string; accent: string }> = {
  warm: { sky: "#F5D9B5", building: "#C2410C", roof: "#7C2D12", window: "#FED7AA", accent: "#FDBA74" },
  cool: { sky: "#DBEAFE", building: "#1E3A8A", roof: "#1E293B", window: "#BFDBFE", accent: "#93C5FD" },
  rose: { sky: "#FCE7F3", building: "#9D174D", roof: "#500724", window: "#FBCFE8", accent: "#F9A8D4" },
  sage: { sky: "#D1FAE5", building: "#065F46", roof: "#064E3B", window: "#A7F3D0", accent: "#6EE7B7" },
  dusk: { sky: "#E0E7FF", building: "#3730A3", roof: "#1E1B4B", window: "#C7D2FE", accent: "#A5B4FC" },
  sand: { sky: "#FEF3C7", building: "#92400E", roof: "#451A03", window: "#FDE68A", accent: "#FCD34D" },
  mono: { sky: "#E5E5E2", building: "#1C1A17", roof: "#0A0A09", window: "#FAF6E8", accent: "#999" },
};

export type CityMotif =
  | "minaret"
  | "dome"
  | "skyscraper"
  | "palm"
  | "canal"
  | "mountain"
  | "bridge"
  | "pagoda"
  | "lighthouse"
  | "windmill";

export function CityIllust({
  city = "Istanbul",
  palette = "warm",
  motif = [],
  postcard,
  className,
  ariaLabel,
}: {
  city?: string;
  palette?: Palette;
  motif?: CityMotif[];
  postcard?: Postcard | null;
  className?: string;
  ariaLabel?: string;
}) {
  // Postcards are the primary cover format. The legacy palette/motif rendering
  // below stays as a fallback for listings that haven't been backfilled yet.
  if (postcard) {
    return <PostcardSvg postcard={postcard} city={city} className={className} ariaLabel={ariaLabel} />;
  }

  const p = cityPalettes[palette] ?? cityPalettes.warm;
  return (
    <svg
      viewBox="0 0 200 140"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label={ariaLabel ?? `${city} illustration`}
    >
      <rect width="200" height="140" fill={p.sky} />
      <circle cx="160" cy="32" r="14" fill={p.accent} opacity="0.85" />
      <path d="M0 110 Q 40 88 80 100 T 160 92 T 200 104 L 200 140 L 0 140 Z" fill={p.accent} opacity="0.4" />

      <g>
        {/* Building 1 */}
        <rect x="10" y="70" width="30" height="70" fill={p.building} />
        <polygon points="10,70 25,55 40,70" fill={p.roof} />
        <rect x="16" y="80" width="6" height="8" fill={p.window} />
        <rect x="28" y="80" width="6" height="8" fill={p.window} />
        <rect x="16" y="96" width="6" height="8" fill={p.window} />
        <rect x="28" y="96" width="6" height="8" fill={p.window} />
        <rect x="22" y="118" width="6" height="22" fill={p.roof} />

        {/* Building 2 — taller */}
        <rect x="46" y="50" width="26" height="90" fill={p.roof} />
        <rect x="46" y="50" width="26" height="5" fill={p.accent} />
        {[62, 74, 86, 98].map((y) => (
          <g key={y}>
            <rect x="52" y={y} width="5" height="6" fill={p.window} />
            <rect x="61" y={y} width="5" height="6" fill={p.window} />
          </g>
        ))}

        {/* Building 3 — dome */}
        <rect x="78" y="78" width="36" height="62" fill={p.building} />
        <path d="M 78 78 A 18 14 0 0 1 114 78" fill={p.roof} />
        <rect x="94" y="72" width="4" height="10" fill={p.roof} />
        <circle cx="96" cy="72" r="2" fill={p.accent} />
        {[92, 108].map((y) => (
          <g key={y}>
            <rect x="84" y={y} width="5" height="7" fill={p.window} />
            <rect x="94" y={y} width="5" height="7" fill={p.window} />
            <rect x="104" y={y} width="5" height="7" fill={p.window} />
          </g>
        ))}

        {/* Building 4 */}
        <rect x="120" y="84" width="24" height="56" fill={p.roof} />
        {[92, 106, 120].map((y) => (
          <g key={y}>
            <rect x="124" y={y} width="5" height="7" fill={p.window} />
            <rect x="135" y={y} width="5" height="7" fill={p.window} />
          </g>
        ))}

        {/* House */}
        <rect x="150" y="96" width="34" height="44" fill={p.building} />
        <polygon points="148,96 167,80 186,96" fill={p.roof} />
        <rect x="156" y="106" width="6" height="8" fill={p.window} />
        <rect x="172" y="106" width="6" height="8" fill={p.window} />
        <rect x="164" y="120" width="6" height="20" fill={p.roof} />
      </g>

      <path d="M 30 28 q 3 -3 6 0 q 3 -3 6 0" stroke={p.building} strokeWidth="1" fill="none" />
      <path d="M 60 22 q 2 -2 4 0 q 2 -2 4 0" stroke={p.building} strokeWidth="0.8" fill="none" />

      {/* AI-chosen motifs sit in front of the building row so they read as silhouettes. */}
      <Motifs motifs={motif} p={p} />

      <text x="10" y="16" fontFamily="monospace" fontSize="8" fill={p.building} letterSpacing="1" fontWeight="600">
        {city.toUpperCase()}
      </text>
    </svg>
  );
}

function Motifs({
  motifs,
  p,
}: {
  motifs: CityMotif[];
  p: { sky: string; building: string; roof: string; window: string; accent: string };
}) {
  if (!motifs.length) return null;
  // Slot each motif in a deterministic x-band so two motifs don't overlap.
  return (
    <g>
      {motifs.includes("minaret") && (
        <g>
          <rect x="56" y="32" width="3" height="48" fill={p.roof} />
          <polygon points="54,32 57.5,22 61,32" fill={p.accent} />
          <circle cx="57.5" cy="22" r="2" fill={p.accent} />
        </g>
      )}
      {motifs.includes("dome") && (
        <g>
          <path d="M 92 64 A 18 18 0 0 1 128 64 Z" fill={p.accent} opacity="0.95" />
          <rect x="108" y="50" width="4" height="14" fill={p.roof} />
          <circle cx="110" cy="48" r="2.2" fill={p.roof} />
        </g>
      )}
      {motifs.includes("skyscraper") && (
        <g>
          <rect x="170" y="22" width="14" height="118" fill={p.roof} />
          <rect x="170" y="22" width="14" height="3" fill={p.accent} />
          <rect x="173" y="34" width="3" height="3" fill={p.window} />
          <rect x="178" y="34" width="3" height="3" fill={p.window} />
          <rect x="173" y="44" width="3" height="3" fill={p.window} />
          <rect x="178" y="44" width="3" height="3" fill={p.window} />
          <rect x="173" y="54" width="3" height="3" fill={p.window} />
          <rect x="178" y="54" width="3" height="3" fill={p.window} />
          <rect x="173" y="64" width="3" height="3" fill={p.window} />
          <rect x="178" y="64" width="3" height="3" fill={p.window} />
        </g>
      )}
      {motifs.includes("pagoda") && (
        <g>
          <rect x="36" y="62" width="22" height="22" fill={p.building} />
          <polygon points="32,62 47,52 62,62" fill={p.roof} />
          <polygon points="34,52 47,42 60,52" fill={p.roof} />
          <polygon points="36,42 47,32 58,42" fill={p.roof} />
          <rect x="46" y="28" width="2" height="6" fill={p.roof} />
        </g>
      )}
      {motifs.includes("palm") && (
        <g>
          <rect x="138" y="76" width="2.4" height="38" fill={p.roof} />
          <path d="M 139.2 78 q -10 -6 -16 -2" stroke={p.accent} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 139.2 78 q 10 -6 16 -2" stroke={p.accent} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 139.2 78 q -10 -10 -10 -16" stroke={p.accent} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 139.2 78 q 10 -10 10 -16" stroke={p.accent} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {motifs.includes("canal") && (
        <g>
          <path
            d="M 0 128 Q 25 124 50 128 T 100 128 T 150 128 T 200 128 L 200 140 L 0 140 Z"
            fill={p.accent}
            opacity="0.55"
          />
          <path
            d="M 0 132 Q 30 130 55 132 T 110 132 T 165 132"
            stroke={p.window}
            strokeWidth="0.8"
            fill="none"
          />
        </g>
      )}
      {motifs.includes("mountain") && (
        <g>
          <polygon points="-10,108 30,52 70,108" fill={p.roof} opacity="0.9" />
          <polygon points="20,108 50,72 80,108" fill={p.roof} opacity="0.6" />
          <polygon points="20,72 30,62 40,72" fill={p.window} opacity="0.6" />
        </g>
      )}
      {motifs.includes("bridge") && (
        <g>
          <path
            d="M 4 92 Q 100 60 196 92"
            stroke={p.roof}
            strokeWidth="2.5"
            fill="none"
          />
          <line x1="40" y1="84" x2="40" y2="100" stroke={p.roof} strokeWidth="1.5" />
          <line x1="100" y1="74" x2="100" y2="100" stroke={p.roof} strokeWidth="1.5" />
          <line x1="160" y1="84" x2="160" y2="100" stroke={p.roof} strokeWidth="1.5" />
        </g>
      )}
      {motifs.includes("lighthouse") && (
        <g>
          <rect x="14" y="44" width="6" height="40" fill={p.accent} />
          <rect x="14" y="44" width="6" height="3" fill={p.roof} />
          <rect x="14" y="50" width="6" height="3" fill={p.roof} />
          <rect x="11" y="40" width="12" height="4" fill={p.roof} />
          <circle cx="17" cy="36" r="3" fill={p.window} />
          <polygon points="14,36 0,30 14,40" fill={p.window} opacity="0.5" />
        </g>
      )}
      {motifs.includes("windmill") && (
        <g>
          <polygon points="146,108 152,68 158,108" fill={p.building} />
          <circle cx="152" cy="68" r="3" fill={p.roof} />
          <line x1="152" y1="68" x2="168" y2="60" stroke={p.roof} strokeWidth="2.4" />
          <line x1="152" y1="68" x2="160" y2="84" stroke={p.roof} strokeWidth="2.4" />
          <line x1="152" y1="68" x2="136" y2="76" stroke={p.roof} strokeWidth="2.4" />
          <line x1="152" y1="68" x2="144" y2="52" stroke={p.roof} strokeWidth="2.4" />
        </g>
      )}
    </g>
  );
}

const housePalettes: Record<Palette, { body: string; roof: string; window: string; door: string }> = {
  warm: { body: "#C2410C", roof: "#7C2D12", window: "#FED7AA", door: "#451A03" },
  cool: { body: "#1E40AF", roof: "#1E293B", window: "#BFDBFE", door: "#1E3A8A" },
  rose: { body: "#BE185D", roof: "#500724", window: "#FBCFE8", door: "#831843" },
  sage: { body: "#047857", roof: "#064E3B", window: "#A7F3D0", door: "#064E3B" },
  dusk: { body: "#4338CA", roof: "#1E1B4B", window: "#C7D2FE", door: "#312E81" },
  sand: { body: "#B45309", roof: "#451A03", window: "#FDE68A", door: "#78350F" },
  mono: { body: "#1C1A17", roof: "#0A0A09", window: "#F5F1EA", door: "#0A0A09" },
};

export function HouseGlyph({
  palette = "warm",
  className,
  style,
}: {
  palette?: Palette;
  className?: string;
  style?: CSSProperties;
}) {
  const p = housePalettes[palette] ?? housePalettes.warm;
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <polygon points="8,38 40,10 72,38" fill={p.roof} />
      <rect x="14" y="38" width="52" height="34" fill={p.body} />
      <rect x="20" y="46" width="10" height="10" fill={p.window} />
      <rect x="50" y="46" width="10" height="10" fill={p.window} />
      <line x1="25" y1="46" x2="25" y2="56" stroke={p.body} strokeWidth="1" />
      <line x1="20" y1="51" x2="30" y2="51" stroke={p.body} strokeWidth="1" />
      <line x1="55" y1="46" x2="55" y2="56" stroke={p.body} strokeWidth="1" />
      <line x1="50" y1="51" x2="60" y2="51" stroke={p.body} strokeWidth="1" />
      <rect x="35" y="58" width="10" height="14" fill={p.door} />
      <circle cx="43" cy="66" r="0.8" fill={p.window} />
    </svg>
  );
}

export function SwapArrows({
  color = "currentColor",
  className,
  style,
  size = 20,
}: {
  color?: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden
    >
      <path
        d="M 6 14 L 30 14 L 26 10 M 30 14 L 26 18"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 34 26 L 10 26 L 14 22 M 10 26 L 14 30"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoMark({
  color = "currentColor",
  accent = "var(--pink)",
  size = 28,
}: {
  color?: string;
  accent?: string;
  size?: number;
}) {
  // swapl mark: an "S" formed inside a hexagonal "house" ring with a window at the
  // waist. `color` draws the navy half + window; `accent` draws the coral half.
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width={size} height={size} aria-hidden>
      <g fill="none" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
        <path stroke={color} d="M 32.5 100 L 32.5 61 L 100 22 L 167.5 61 Q 167.5 104 132 108 L 117 110" />
        <path stroke={accent} d="M 167.5 100 L 167.5 139 L 100 178 L 32.5 139 Q 32.5 96 68 92 L 83 90" />
      </g>
      <g fill={color}>
        <rect x="87.5" y="87.5" width="11" height="11" rx="2.6" />
        <rect x="101.5" y="87.5" width="11" height="11" rx="2.6" />
        <rect x="87.5" y="101.5" width="11" height="11" rx="2.6" />
        <rect x="101.5" y="101.5" width="11" height="11" rx="2.6" />
      </g>
    </svg>
  );
}

export function Pin({ color = "currentColor", size = 12, style }: { color?: string; size?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" width={size} height={size} style={style} aria-hidden>
      <path d="M 6 1 C 3 1 2 3 2 5 C 2 7 6 11 6 11 C 6 11 10 7 10 5 C 10 3 9 1 6 1 Z" fill={color} />
      <circle cx="6" cy="5" r="1.5" fill="#fff" />
    </svg>
  );
}

const stepPalettes = {
  playful: { ink: "#1A1F3C", accent: "#F24B8E", soft: "#FDEEF5", bg: "#FAF6E8" },
  warm: { ink: "#1C1A17", accent: "#C2410C", soft: "#FED7AA", bg: "#F5D9B5" },
  cool: { ink: "#0A0A09", accent: "#0F172A", soft: "#CBD5E1", bg: "#E2E8F0" },
};
type StepPalette = keyof typeof stepPalettes;

export function StepIllust({
  step = 1,
  palette = "playful",
  className,
}: {
  step?: 1 | 2 | 3 | 4;
  palette?: StepPalette;
  className?: string;
}) {
  const p = stepPalettes[palette] ?? stepPalettes.playful;

  if (step === 1) {
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" className={className} style={{ height: "100%" }} aria-hidden>
        <rect x="4" y="8" width="86" height="74" rx="4" fill={p.bg} stroke={p.ink} strokeWidth="1" />
        <rect x="12" y="16" width="70" height="8" rx="2" fill={p.ink} opacity="0.9" />
        <rect x="12" y="30" width="50" height="4" rx="1" fill={p.ink} opacity="0.3" />
        <rect x="12" y="38" width="60" height="4" rx="1" fill={p.ink} opacity="0.3" />
        <rect x="12" y="46" width="40" height="4" rx="1" fill={p.ink} opacity="0.3" />
        <rect x="12" y="58" width="26" height="16" rx="2" fill={p.accent} />
        <rect x="42" y="58" width="26" height="16" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.8" />
        <circle cx="100" cy="24" r="14" fill={p.accent} />
        <path d="M 100 18 L 100 30 M 94 24 L 106 24" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (step === 2) {
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" className={className} style={{ height: "100%" }} aria-hidden>
        <rect x="4" y="10" width="52" height="70" rx="4" fill={p.bg} stroke={p.ink} strokeWidth="1" />
        <rect x="10" y="18" width="18" height="5" rx="2" fill={p.accent} />
        <rect x="32" y="18" width="18" height="5" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.5" />
        <rect x="10" y="28" width="40" height="3" rx="1" fill={p.ink} opacity="0.5" />
        <rect x="10" y="35" width="30" height="3" rx="1" fill={p.ink} opacity="0.25" />
        <rect x="10" y="42" width="40" height="3" rx="1" fill={p.ink} opacity="0.25" />
        <rect x="10" y="52" width="14" height="5" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.5" />
        <rect x="26" y="52" width="14" height="5" rx="2" fill={p.accent} />
        <rect x="10" y="62" width="40" height="10" rx="2" fill={p.ink} opacity="0.15" />
        <circle cx="14" cy="67" r="2" fill={p.accent} />
        <path d="M 60 45 L 70 45 M 67 42 L 70 45 L 67 48" stroke={p.ink} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <rect x="74" y="22" width="42" height="14" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.6" />
        <rect x="74" y="40" width="42" height="14" rx="2" fill={p.accent} />
        <rect x="74" y="58" width="42" height="14" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.6" />
      </svg>
    );
  }
  if (step === 3) {
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" className={className} style={{ height: "100%" }} aria-hidden>
        <g transform="translate(4 32)">
          <polygon points="2,18 18,4 34,18" fill={p.accent} />
          <rect x="6" y="18" width="26" height="22" fill={p.ink} />
          <rect x="11" y="24" width="6" height="6" fill={p.soft} />
          <rect x="22" y="24" width="6" height="6" fill={p.soft} />
        </g>
        <g transform="translate(82 32)">
          <polygon points="2,18 18,4 34,18" fill={p.ink} />
          <rect x="6" y="18" width="26" height="22" fill={p.accent} />
          <rect x="11" y="24" width="6" height="6" fill={p.soft} />
          <rect x="22" y="24" width="6" height="6" fill={p.soft} />
        </g>
        <path
          d="M 42 48 Q 60 36 78 48 M 76 44 L 78 48 L 74 48"
          stroke={p.ink}
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 78 58 Q 60 70 42 58 M 44 62 L 42 58 L 46 58"
          stroke={p.accent}
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // step 4
  return (
    <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" className={className} style={{ height: "100%" }} aria-hidden>
      <rect x="20" y="12" width="60" height="66" rx="4" fill={p.ink} />
      <rect x="28" y="22" width="44" height="3" rx="1" fill={p.soft} />
      <rect x="28" y="30" width="34" height="3" rx="1" fill={p.soft} opacity="0.5" />
      <circle cx="50" cy="52" r="12" fill="none" stroke={p.accent} strokeWidth="1.5" />
      <path d="M 44 52 L 48 56 L 56 48" stroke={p.accent} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="28" y="68" width="44" height="3" rx="1" fill={p.soft} opacity="0.5" />
      <g transform="translate(78 48) rotate(-18)">
        <rect x="-18" y="-10" width="36" height="20" rx="2" fill="none" stroke={p.accent} strokeWidth="1.2" />
        <text x="0" y="4" textAnchor="middle" fontFamily="monospace" fontSize="7" fill={p.accent} fontWeight="700">
          BACKED
        </text>
      </g>
    </svg>
  );
}
