// Renders a Postcard DSL as a single layered SVG. Style stays consistent with
// the existing CityIllust: flat geometric, palette-driven fills, monospace
// label, no photographic detail.
//
// Each landmark element is a self-contained <g> drawing relative to its own
// origin (cx, baselineY). The renderer walks the elements array and translates
// each into position. Default landmark width is 40 viewBox units; scale is
// applied via SVG transform.

import type { Palette } from "@/components/illustrations";
import type {
  Postcard,
  PostcardElement,
  PostcardElementInstance,
  Sky,
  Ground,
} from "@/lib/ai/postcard-types";

const VIEW_W = 200;
const VIEW_H = 140;
const BASELINE = 120;

// ---------- Palette resolver ----------

type Tones = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  building: string;
  buildingLight: string;
  roof: string;
  window: string;
  accent: string;
  ground: string;
  groundShade: string;
};

const PALETTE_TONES: Record<Palette, Tones> = {
  warm: {
    skyTop: "#F5D9B5", skyBottom: "#FFE8C9", sun: "#FCD34D",
    building: "#C2410C", buildingLight: "#EA580C", roof: "#7C2D12",
    window: "#FED7AA", accent: "#FDBA74", ground: "#E7B58A", groundShade: "#A45C2D",
  },
  cool: {
    skyTop: "#DBEAFE", skyBottom: "#F1F5FF", sun: "#FEF3C7",
    building: "#1E3A8A", buildingLight: "#1E40AF", roof: "#1E293B",
    window: "#BFDBFE", accent: "#93C5FD", ground: "#CBD5E1", groundShade: "#475569",
  },
  rose: {
    skyTop: "#FCE7F3", skyBottom: "#FFE4F2", sun: "#FDE68A",
    building: "#9D174D", buildingLight: "#BE185D", roof: "#500724",
    window: "#FBCFE8", accent: "#F9A8D4", ground: "#F4C5DA", groundShade: "#831843",
  },
  sage: {
    skyTop: "#D1FAE5", skyBottom: "#ECFDF5", sun: "#FCD34D",
    building: "#065F46", buildingLight: "#047857", roof: "#064E3B",
    window: "#A7F3D0", accent: "#6EE7B7", ground: "#A7F3D0", groundShade: "#065F46",
  },
  dusk: {
    skyTop: "#E0E7FF", skyBottom: "#F1F5FF", sun: "#FCD34D",
    building: "#3730A3", buildingLight: "#4338CA", roof: "#1E1B4B",
    window: "#C7D2FE", accent: "#A5B4FC", ground: "#C7D2FE", groundShade: "#312E81",
  },
  sand: {
    skyTop: "#FEF3C7", skyBottom: "#FFFBEB", sun: "#F59E0B",
    building: "#92400E", buildingLight: "#B45309", roof: "#451A03",
    window: "#FDE68A", accent: "#FCD34D", ground: "#FDE68A", groundShade: "#92400E",
  },
  mono: {
    skyTop: "#E5E5E2", skyBottom: "#F1F1EF", sun: "#1A1F3C",
    building: "#1C1A17", buildingLight: "#3a3631", roof: "#0A0A09",
    window: "#FAF6E8", accent: "#7A746A", ground: "#D9D0BD", groundShade: "#3a3631",
  },
};

// Sky & ground modifiers shift the base palette tones for time-of-day.
function applySky(t: Tones, sky: Sky): Tones {
  if (sky === "day") return t;
  if (sky === "dawn") {
    return { ...t, skyTop: "#FBA94A", skyBottom: "#FFE0B5", sun: "#FFF1A8" };
  }
  if (sky === "dusk") {
    return { ...t, skyTop: "#5B5093", skyBottom: "#F38BA0", sun: "#FFE066" };
  }
  // night
  return {
    ...t,
    skyTop: "#11142A",
    skyBottom: "#1E1F4A",
    sun: "#F5E5A8",
    window: t.accent,
  };
}

// ---------- Element library ----------
// Each function is a stateless renderer: it receives palette tones + the
// instance's screen position (cx, baseline) and scale, and returns SVG.
// Keep them tight — one or two motifs per element.

type R = { t: Tones; cx: number; scale: number; flip: boolean };

const E: Record<PostcardElement, (r: R) => React.ReactElement> = {
  // ===== Istanbul =====
  "hagia-sophia": ({ t, cx, scale, flip }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale * (flip ? -1 : 1)} ${scale})`}>
      {/* central dome */}
      <rect x={-26} y={-30} width={52} height={30} fill={t.building} />
      <path d="M -26 -30 A 26 22 0 0 1 26 -30 Z" fill={t.accent} />
      <rect x={-3} y={-50} width={3} height={20} fill={t.roof} />
      <circle cx={-1.5} cy={-52} r={2} fill={t.roof} />
      {/* half-domes */}
      <path d="M -42 -16 A 16 14 0 0 1 -10 -16 Z" fill={t.accent} opacity="0.95" />
      <path d="M 10 -16 A 16 14 0 0 1 42 -16 Z" fill={t.accent} opacity="0.95" />
      <rect x={-42} y={-16} width={32} height={16} fill={t.building} />
      <rect x={10} y={-16} width={32} height={16} fill={t.building} />
      {/* minarets flanking */}
      <rect x={-50} y={-44} width={3} height={44} fill={t.roof} />
      <polygon points={`-51.5,-44 -48.5,-54 -45.5,-44`} fill={t.accent} />
      <rect x={47} y={-44} width={3} height={44} fill={t.roof} />
      <polygon points={`45.5,-44 48.5,-54 51.5,-44`} fill={t.accent} />
      {/* windows */}
      <rect x={-22} y={-22} width={4} height={6} fill={t.window} />
      <rect x={-12} y={-22} width={4} height={6} fill={t.window} />
      <rect x={8} y={-22} width={4} height={6} fill={t.window} />
      <rect x={18} y={-22} width={4} height={6} fill={t.window} />
    </g>
  ),
  "blue-mosque": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-22} y={-26} width={44} height={26} fill={t.building} />
      <path d="M -22 -26 A 22 20 0 0 1 22 -26 Z" fill={t.accent} />
      {[-32, -16, 0, 16, 32].map((x, i) => (
        <g key={i}>
          <rect x={x - 1} y={-44} width={2} height={44} fill={t.roof} />
          <polygon points={`${x - 2},-44 ${x},-50 ${x + 2},-44`} fill={t.accent} />
        </g>
      ))}
      <rect x={-3} y={-50} width={3} height={24} fill={t.roof} />
      <circle cx={-1.5} cy={-52} r={1.8} fill={t.roof} />
    </g>
  ),
  "galata-tower": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-7} y={-50} width={14} height={50} fill={t.buildingLight} />
      <rect x={-9} y={-52} width={18} height={4} fill={t.roof} />
      <polygon points={`-9,-52 0,-66 9,-52`} fill={t.roof} />
      <rect x={-5} y={-44} width={3} height={4} fill={t.window} />
      <rect x={2} y={-44} width={3} height={4} fill={t.window} />
      <rect x={-5} y={-32} width={3} height={4} fill={t.window} />
      <rect x={2} y={-32} width={3} height={4} fill={t.window} />
      <rect x={-5} y={-20} width={3} height={4} fill={t.window} />
      <rect x={2} y={-20} width={3} height={4} fill={t.window} />
    </g>
  ),
  "bosphorus-bridge": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <path d={`M -50 -8 Q 0 -34 50 -8`} stroke={t.roof} strokeWidth={1.5} fill="none" />
      <line x1={-30} y1={-12} x2={-30} y2={-2} stroke={t.roof} strokeWidth={1.2} />
      <line x1={0} y1={-22} x2={0} y2={-2} stroke={t.roof} strokeWidth={1.2} />
      <line x1={30} y1={-12} x2={30} y2={-2} stroke={t.roof} strokeWidth={1.2} />
      <rect x={-50} y={-2} width={100} height={3} fill={t.roof} />
    </g>
  ),

  // ===== Paris =====
  eiffel: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon
        points={`-18,0 -6,-30 -3,-30 0,-66 3,-30 6,-30 18,0 12,0 6,-22 -6,-22 -12,0`}
        fill={t.roof}
      />
      <rect x={-1.2} y={-72} width={2.4} height={6} fill={t.roof} />
      <line x1={-12} y1={-12} x2={12} y2={-12} stroke={t.roof} strokeWidth={0.8} />
      <line x1={-9} y1={-22} x2={9} y2={-22} stroke={t.roof} strokeWidth={0.8} />
      <line x1={-4} y1={-46} x2={4} y2={-46} stroke={t.roof} strokeWidth={0.8} />
    </g>
  ),
  "arc-de-triomphe": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-18} y={-30} width={36} height={30} fill={t.buildingLight} />
      <path d="M -8 0 L -8 -16 A 8 12 0 0 1 8 -16 L 8 0 Z" fill={t.skyBottom} />
      <rect x={-18} y={-32} width={36} height={3} fill={t.roof} />
      <rect x={-18} y={-30} width={3} height={30} fill={t.roof} opacity="0.6" />
      <rect x={15} y={-30} width={3} height={30} fill={t.roof} opacity="0.6" />
    </g>
  ),
  "sacre-coeur": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-22} y={-22} width={44} height={22} fill={t.accent} />
      <path d="M -10 -22 A 10 14 0 0 1 10 -22 Z" fill={t.window} />
      <path d="M -22 -22 A 7 10 0 0 1 -8 -22 Z" fill={t.window} />
      <path d="M 8 -22 A 7 10 0 0 1 22 -22 Z" fill={t.window} />
      <rect x={-2} y={-40} width={4} height={18} fill={t.window} />
    </g>
  ),

  // ===== London =====
  "big-ben": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-7} y={-58} width={14} height={58} fill={t.buildingLight} />
      <rect x={-9} y={-58} width={18} height={4} fill={t.roof} />
      <rect x={-6} y={-52} width={12} height={12} fill={t.window} />
      <circle cx={0} cy={-46} r={4} fill={t.skyBottom} stroke={t.roof} strokeWidth={0.8} />
      <line x1={0} y1={-46} x2={0} y2={-49} stroke={t.roof} strokeWidth={0.8} />
      <line x1={0} y1={-46} x2={3} y2={-46} stroke={t.roof} strokeWidth={0.8} />
      <polygon points={`-9,-58 0,-72 9,-58`} fill={t.roof} />
      <rect x={-1.2} y={-78} width={2.4} height={6} fill={t.roof} />
    </g>
  ),
  "tower-bridge": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-30} y={-2} width={60} height={3} fill={t.roof} />
      <rect x={-26} y={-32} width={10} height={32} fill={t.buildingLight} />
      <rect x={16} y={-32} width={10} height={32} fill={t.buildingLight} />
      <polygon points={`-26,-32 -21,-42 -16,-32`} fill={t.roof} />
      <polygon points={`16,-32 21,-42 26,-32`} fill={t.roof} />
      <path d="M -16 -10 Q 0 -22 16 -10" stroke={t.roof} strokeWidth={1.4} fill="none" />
    </g>
  ),

  // ===== Tokyo =====
  "tokyo-tower": ({ t, cx, scale }) => {
    const red = "#E1382B";
    return (
      <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
        <polygon points={`-14,0 -3,-44 0,-44 3,-44 14,0 9,0 3,-34 -3,-34 -9,0`} fill={red} />
        <polygon points={`-3,-44 -2,-58 2,-58 3,-44`} fill={red} />
        <rect x={-1} y={-66} width={2} height={8} fill={red} />
        <line x1={-9} y1={-12} x2={9} y2={-12} stroke={red} strokeWidth={1} />
        <line x1={-6} y1={-26} x2={6} y2={-26} stroke={red} strokeWidth={0.8} />
      </g>
    );
  },
  pagoda: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-10} y={-20} width={20} height={20} fill={t.building} />
      <polygon points={`-14,-20 0,-30 14,-20`} fill={t.roof} />
      <polygon points={`-12,-30 0,-39 12,-30`} fill={t.roof} />
      <polygon points={`-10,-39 0,-48 10,-39`} fill={t.roof} />
      <rect x={-1} y={-54} width={2} height={6} fill={t.roof} />
    </g>
  ),
  "mount-fuji": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-50,0 0,-60 50,0`} fill={t.groundShade} opacity={0.92} />
      <polygon points={`-12,-46 -6,-50 0,-60 6,-50 12,-46 4,-44 -4,-44`} fill={"#FFFFFF"} />
    </g>
  ),
  "torii-gate": ({ t, cx, scale }) => {
    const red = "#C5251F";
    return (
      <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
        <rect x={-3} y={-30} width={3} height={30} fill={red} />
        <rect x={3} y={-30} width={3} height={30} fill={red} />
        <rect x={-12} y={-32} width={24} height={3} fill={red} />
        <rect x={-14} y={-38} width={28} height={4} fill={red} />
        <rect x={-1} y={-32} width={2} height={4} fill={red} />
      </g>
    );
  },

  // ===== Amsterdam =====
  "canal-houses": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-30, -18, -6, 6, 18].map((x, i) => {
        const h = 28 + ((i * 7) % 12);
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <rect x={-5} y={-h} width={10} height={h} fill={i % 2 === 0 ? t.buildingLight : t.building} />
            <polygon points={`-5,-${h} 0,-${h + 7} 5,-${h}`} fill={t.roof} />
            <rect x={-3} y={-h + 4} width={2} height={3} fill={t.window} />
            <rect x={1} y={-h + 4} width={2} height={3} fill={t.window} />
            <rect x={-3} y={-h + 12} width={2} height={3} fill={t.window} />
            <rect x={1} y={-h + 12} width={2} height={3} fill={t.window} />
          </g>
        );
      })}
    </g>
  ),
  windmill: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-7,0 -4,-30 4,-30 7,0`} fill={t.building} />
      <rect x={-7} y={-32} width={14} height={3} fill={t.roof} />
      <circle cx={0} cy={-30} r={2} fill={t.roof} />
      <line x1={0} y1={-30} x2={14} y2={-38} stroke={t.roof} strokeWidth={2.4} />
      <line x1={0} y1={-30} x2={6} y2={-46} stroke={t.roof} strokeWidth={2.4} />
      <line x1={0} y1={-30} x2={-14} y2={-22} stroke={t.roof} strokeWidth={2.4} />
      <line x1={0} y1={-30} x2={-6} y2={-14} stroke={t.roof} strokeWidth={2.4} />
    </g>
  ),
  "tulip-row": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-18, -6, 6, 18].map((x, i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <line x1={0} y1={0} x2={0} y2={-12} stroke={t.groundShade} strokeWidth={1} />
          <path d="M -3 -12 Q 0 -16 3 -12 Q 0 -10 -3 -12 Z" fill={i % 2 === 0 ? "#E11D48" : "#F472B6"} />
        </g>
      ))}
    </g>
  ),

  // ===== Lisbon =====
  "april-25-bridge": ({ t, cx, scale }) => {
    const red = "#C2422C";
    return (
      <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
        <rect x={-44} y={-4} width={88} height={2.5} fill={red} />
        <rect x={-22} y={-32} width={3} height={32} fill={red} />
        <rect x={19} y={-32} width={3} height={32} fill={red} />
        <path d={`M -44 -4 Q -22 -28 0 -10 Q 22 -28 44 -4`} stroke={red} strokeWidth={1.2} fill="none" />
        <line x1={-12} y1={-4} x2={-12} y2={-14} stroke={red} strokeWidth={0.8} />
        <line x1={12} y1={-4} x2={12} y2={-14} stroke={red} strokeWidth={0.8} />
      </g>
    );
  },
  "tram-28": ({ t, cx, scale }) => {
    const yellow = "#FACC15";
    return (
      <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
        <rect x={-18} y={-14} width={36} height={12} fill={yellow} />
        <rect x={-18} y={-18} width={36} height={4} fill="#B45309" />
        <rect x={-15} y={-12} width={6} height={5} fill={t.window} />
        <rect x={-7} y={-12} width={6} height={5} fill={t.window} />
        <rect x={1} y={-12} width={6} height={5} fill={t.window} />
        <rect x={9} y={-12} width={6} height={5} fill={t.window} />
        <circle cx={-12} cy={-1} r={2.5} fill="#1F2937" />
        <circle cx={12} cy={-1} r={2.5} fill="#1F2937" />
        <line x1={-22} y1={-1} x2={22} y2={-1} stroke="#1F2937" strokeWidth={0.4} />
      </g>
    );
  },
  rowhouse: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-22, -8, 6, 20].map((x, i) => {
        const colors = ["#FCD34D", "#F472B6", "#60A5FA", "#34D399"];
        const h = 22 + ((i * 5) % 10);
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <rect x={-6} y={-h} width={12} height={h} fill={colors[i % colors.length]} />
            <rect x={-6} y={-h - 2} width={12} height={3} fill={t.roof} />
            <rect x={-3} y={-h + 4} width={2} height={3} fill={t.window} />
            <rect x={1} y={-h + 4} width={2} height={3} fill={t.window} />
            <rect x={-1} y={-6} width={2} height={6} fill={t.roof} />
          </g>
        );
      })}
    </g>
  ),
  "azulejo-tower": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-7} y={-44} width={14} height={44} fill={"#3B82F6"} />
      <rect x={-9} y={-46} width={18} height={3} fill={t.roof} />
      <polygon points={`-9,-46 0,-58 9,-46`} fill={t.roof} />
      <rect x={-3} y={-38} width={2} height={2} fill={t.window} />
      <rect x={1} y={-38} width={2} height={2} fill={t.window} />
      <rect x={-3} y={-30} width={2} height={2} fill={t.window} />
      <rect x={1} y={-30} width={2} height={2} fill={t.window} />
      <rect x={-3} y={-22} width={2} height={2} fill={t.window} />
      <rect x={1} y={-22} width={2} height={2} fill={t.window} />
    </g>
  ),

  // ===== CDMX =====
  "mexico-cathedral": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-26} y={-22} width={52} height={22} fill={t.buildingLight} />
      <rect x={-18} y={-36} width={10} height={14} fill={t.buildingLight} />
      <rect x={8} y={-36} width={10} height={14} fill={t.buildingLight} />
      <polygon points={`-18,-36 -13,-44 -8,-36`} fill={t.roof} />
      <polygon points={`8,-36 13,-44 18,-36`} fill={t.roof} />
      <path d="M -8 -22 A 8 7 0 0 1 8 -22 Z" fill={t.accent} />
      <rect x={-1.2} y={-30} width={2.4} height={8} fill={t.roof} />
    </g>
  ),
  "step-pyramid": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-30,0 -22,-10 22,-10 30,0`} fill={t.groundShade} />
      <polygon points={`-22,-10 -16,-20 16,-20 22,-10`} fill={t.building} />
      <polygon points={`-16,-20 -10,-30 10,-30 16,-20`} fill={t.groundShade} />
      <rect x={-3} y={-32} width={6} height={2} fill={t.roof} />
    </g>
  ),
  agave: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-8, -4, 0, 4, 8].map((x, i) => (
        <polygon
          key={i}
          points={`${x},0 ${x - 2 + i * 0.3},-12 ${x + 2 + i * 0.3},-10`}
          fill={"#4B6F44"}
        />
      ))}
    </g>
  ),

  // ===== Brooklyn / NYC =====
  "brooklyn-bridge": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-46} y={-4} width={92} height={3} fill={t.roof} />
      <g>
        <rect x={-22} y={-44} width={6} height={44} fill={t.buildingLight} />
        <polygon points={`-22,-44 -19,-52 -16,-44`} fill={t.roof} />
        <rect x={-22} y={-30} width={6} height={6} fill={t.window} />
        <rect x={-22} y={-18} width={6} height={6} fill={t.window} />
      </g>
      <g>
        <rect x={16} y={-44} width={6} height={44} fill={t.buildingLight} />
        <polygon points={`16,-44 19,-52 22,-44`} fill={t.roof} />
        <rect x={16} y={-30} width={6} height={6} fill={t.window} />
        <rect x={16} y={-18} width={6} height={6} fill={t.window} />
      </g>
      <path d={`M -46 -4 Q -19 -42 0 -16 Q 19 -42 46 -4`} stroke={t.roof} strokeWidth={1} fill="none" />
      <path d={`M -46 -4 Q -19 -32 0 -10 Q 19 -32 46 -4`} stroke={t.roof} strokeWidth={0.6} fill="none" />
    </g>
  ),
  "manhattan-skyline": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-30, -22, -14, -6, 2, 10, 18, 26].map((x, i) => {
        const h = 30 + ((i * 11) % 28) + (i === 3 ? 14 : 0);
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <rect x={-3} y={-h} width={6} height={h} fill={i % 2 === 0 ? t.building : t.buildingLight} />
            {Array.from({ length: Math.min(6, Math.floor(h / 6)) }).map((_, k) => (
              <rect key={k} x={-2} y={-h + 4 + k * 6} width={1.5} height={2} fill={t.window} />
            ))}
            {i === 3 && <rect x={-1} y={-h - 6} width={2} height={6} fill={t.roof} />}
          </g>
        );
      })}
    </g>
  ),
  "statue-of-liberty": ({ t, cx, scale }) => {
    const teal = "#5DA39A";
    return (
      <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
        <rect x={-9} y={-10} width={18} height={10} fill={t.groundShade} />
        <polygon points={`-7,-10 0,-22 7,-10`} fill={teal} opacity={0.85} />
        <circle cx={0} cy={-26} r={4} fill={teal} />
        {[-6, -3, 0, 3, 6].map((dx, i) => (
          <line key={i} x1={0} y1={-30} x2={dx * 1.2} y2={-36} stroke={teal} strokeWidth={1.2} />
        ))}
        <line x1={-3} y1={-26} x2={-9} y2={-22} stroke={teal} strokeWidth={1.2} />
        <line x1={3} y1={-26} x2={9} y2={-30} stroke={teal} strokeWidth={1.4} />
        <rect x={9} y={-32} width={2} height={8} fill={t.sun} />
      </g>
    );
  },
  brownstone: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-16} y={-30} width={32} height={30} fill={"#8B4513"} />
      <rect x={-16} y={-32} width={32} height={3} fill={t.roof} />
      <rect x={-12} y={-26} width={6} height={6} fill={t.window} />
      <rect x={6} y={-26} width={6} height={6} fill={t.window} />
      <rect x={-12} y={-16} width={6} height={6} fill={t.window} />
      <rect x={6} y={-16} width={6} height={6} fill={t.window} />
      <rect x={-3} y={-12} width={6} height={12} fill={t.roof} />
      <rect x={-2.5} y={-2} width={5} height={2} fill={"#FCD34D"} />
    </g>
  ),

  // ===== Marrakesh =====
  koutoubia: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-9} y={-56} width={18} height={56} fill={t.buildingLight} />
      <rect x={-11} y={-58} width={22} height={4} fill={t.roof} />
      <rect x={-7} y={-62} width={14} height={6} fill={t.buildingLight} />
      <rect x={-9} y={-62} width={18} height={2} fill={t.roof} />
      <rect x={-2} y={-72} width={4} height={10} fill={t.roof} />
      <circle cx={0} cy={-74} r={2} fill={t.accent} />
      {[-6, 0, 6].map((y, i) => (
        <rect key={i} x={-3} y={-50 + y * 4} width={6} height={2} fill={t.window} />
      ))}
    </g>
  ),
  "riad-arch": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-14} y={-28} width={28} height={28} fill={t.buildingLight} />
      <path d="M -8 0 L -8 -16 Q -8 -24 0 -24 Q 8 -24 8 -16 L 8 0 Z" fill={t.skyBottom} />
      <rect x={-14} y={-28} width={28} height={3} fill={t.roof} />
    </g>
  ),
  palm: ({ t, cx, scale, flip }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale * (flip ? -1 : 1)} ${scale})`}>
      <rect x={-1.4} y={-30} width={2.8} height={30} fill={t.groundShade} />
      <path d="M 0 -30 q -16 -6 -22 -2" stroke={t.accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M 0 -30 q 16 -6 22 -2" stroke={t.accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M 0 -30 q -10 -16 -8 -22" stroke={t.accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M 0 -30 q 10 -16 8 -22" stroke={t.accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </g>
  ),

  // ===== Berlin =====
  "brandenburger-tor": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-30} y={-30} width={60} height={4} fill={t.roof} />
      {[-26, -16, -6, 4, 14, 24].map((x, i) => (
        <rect key={i} x={x - 1.5} y={-26} width={3} height={26} fill={t.buildingLight} />
      ))}
      <rect x={-30} y={-36} width={60} height={6} fill={t.buildingLight} />
      <rect x={-3} y={-44} width={6} height={2} fill={t.roof} />
      <rect x={-1} y={-50} width={2} height={6} fill={t.roof} />
    </g>
  ),
  "tv-tower": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-1.4} y={-50} width={2.8} height={50} fill={t.roof} />
      <circle cx={0} cy={-54} r={6} fill={t.buildingLight} stroke={t.roof} strokeWidth={0.8} />
      <rect x={-1.4} y={-66} width={2.8} height={12} fill={t.roof} />
      <circle cx={0} cy={-54} r={2} fill={t.window} />
    </g>
  ),
  "reichstag-dome": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-22} y={-22} width={44} height={22} fill={t.buildingLight} />
      <rect x={-22} y={-22} width={44} height={3} fill={t.roof} />
      <path d="M -10 -22 A 10 10 0 0 1 10 -22 Z" fill={t.window} stroke={t.roof} strokeWidth={0.6} />
      <line x1={-10} y1={-22} x2={10} y2={-22} stroke={t.roof} strokeWidth={0.4} />
      {[-7, -3, 0, 3, 7].map((x, i) => (
        <line key={i} x1={x} y1={-22} x2={x * 0.5} y2={-32} stroke={t.roof} strokeWidth={0.3} />
      ))}
    </g>
  ),

  // ===== Seoul =====
  gyeongbokgung: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-26} y={-12} width={52} height={12} fill={"#9B2D20"} />
      <rect x={-30} y={-22} width={60} height={4} fill={"#1A1F3C"} />
      <path d="M -32 -22 Q 0 -36 32 -22 Z" fill={"#1A1F3C"} />
      <rect x={-30} y={-26} width={60} height={4} fill={"#9B2D20"} />
      <rect x={-3} y={-12} width={6} height={12} fill={"#1A1F3C"} />
      <rect x={-22} y={-8} width={4} height={4} fill={t.window} />
      <rect x={18} y={-8} width={4} height={4} fill={t.window} />
    </g>
  ),
  "namsan-tower": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-12,0 -2,-30 2,-30 12,0`} fill={t.groundShade} opacity={0.6} />
      <rect x={-1} y={-50} width={2} height={20} fill={t.roof} />
      <ellipse cx={0} cy={-52} rx={5} ry={3} fill={t.buildingLight} stroke={t.roof} strokeWidth={0.6} />
      <rect x={-1} y={-60} width={2} height={8} fill={t.roof} />
    </g>
  ),
  bukhansan: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-60,0 -30,-30 -10,-12 10,-40 30,-18 60,0`} fill={t.groundShade} opacity={0.85} />
      <polygon points={`5,-30 10,-40 15,-30`} fill={"#FFFFFF"} opacity={0.9} />
    </g>
  ),

  // ===== Generics =====
  "mountain-range": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <polygon points={`-60,0 -30,-26 -8,-10 14,-34 38,-12 60,0`} fill={t.groundShade} opacity={0.85} />
    </g>
  ),
  skyscraper: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-7} y={-58} width={14} height={58} fill={t.roof} />
      <rect x={-7} y={-58} width={14} height={3} fill={t.accent} />
      {Array.from({ length: 9 }).map((_, k) => (
        <g key={k}>
          <rect x={-5} y={-52 + k * 6} width={3} height={3} fill={t.window} />
          <rect x={2} y={-52 + k * 6} width={3} height={3} fill={t.window} />
        </g>
      ))}
    </g>
  ),
  dome: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-18} y={-18} width={36} height={18} fill={t.buildingLight} />
      <path d="M -18 -18 A 18 16 0 0 1 18 -18 Z" fill={t.accent} />
      <rect x={-1.5} y={-40} width={3} height={22} fill={t.roof} />
    </g>
  ),
  minaret: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-2} y={-50} width={4} height={50} fill={t.roof} />
      <polygon points={`-4,-50 0,-60 4,-50`} fill={t.accent} />
      <circle cx={0} cy={-62} r={2} fill={t.accent} />
    </g>
  ),
  lighthouse: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-5} y={-44} width={10} height={44} fill={t.accent} />
      <rect x={-5} y={-44} width={10} height={3} fill={t.roof} />
      <rect x={-5} y={-38} width={10} height={3} fill={t.roof} />
      <rect x={-7} y={-50} width={14} height={4} fill={t.roof} />
      <circle cx={0} cy={-54} r={2} fill={t.window} />
      <polygon points={`-6,-54 -16,-50 -6,-58`} fill={t.window} opacity={0.5} />
    </g>
  ),
  "bridge-arch": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <path d="M -36 0 Q 0 -28 36 0 Z" fill={t.skyBottom} stroke={t.roof} strokeWidth={1} />
      <rect x={-36} y={-2} width={72} height={2} fill={t.roof} />
    </g>
  ),
  "clock-tower": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-7} y={-50} width={14} height={50} fill={t.buildingLight} />
      <polygon points={`-9,-50 0,-62 9,-50`} fill={t.roof} />
      <circle cx={0} cy={-40} r={4} fill={t.skyBottom} stroke={t.roof} strokeWidth={0.6} />
      <line x1={0} y1={-40} x2={0} y2={-43} stroke={t.roof} strokeWidth={0.5} />
      <line x1={0} y1={-40} x2={2.5} y2={-40} stroke={t.roof} strokeWidth={0.5} />
    </g>
  ),
  "rowhouse-stack": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-22, -10, 2, 14].map((x, i) => {
        const h = 22 + i * 4;
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <rect x={-5} y={-h} width={10} height={h} fill={i % 2 === 0 ? t.building : t.buildingLight} />
            <rect x={-5} y={-h - 2} width={10} height={3} fill={t.roof} />
            <rect x={-3} y={-h + 4} width={2} height={3} fill={t.window} />
            <rect x={1} y={-h + 4} width={2} height={3} fill={t.window} />
          </g>
        );
      })}
    </g>
  ),
  "palm-row": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      {[-22, -7, 8, 22].map((x, i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <rect x={-1} y={-22} width={2} height={22} fill={t.groundShade} />
          <path d="M 0 -22 q -10 -4 -14 -1" stroke={t.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M 0 -22 q 10 -4 14 -1" stroke={t.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M 0 -22 q -7 -10 -6 -16" stroke={t.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M 0 -22 q 7 -10 6 -16" stroke={t.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </g>
  ),
  sailboat: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <path d="M -8 -2 L 8 -2 L 5 2 L -5 2 Z" fill={t.roof} />
      <line x1={0} y1={-2} x2={0} y2={-18} stroke={t.roof} strokeWidth={0.8} />
      <polygon points={`0,-18 0,-4 7,-4`} fill={"#FFFFFF"} stroke={t.roof} strokeWidth={0.4} />
      <polygon points={`0,-18 0,-6 -5,-6`} fill={t.window} stroke={t.roof} strokeWidth={0.4} />
    </g>
  ),
  hill: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <path d="M -40 0 Q 0 -30 40 0 Z" fill={t.groundShade} opacity={0.7} />
    </g>
  ),
  fortress: ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-22} y={-18} width={44} height={18} fill={t.buildingLight} />
      {[-22, -16, -10, -4, 2, 8, 14, 20].map((x, i) => (
        <rect key={i} x={x - 1.5} y={-22} width={3} height={4} fill={t.roof} />
      ))}
      <rect x={-3} y={-12} width={6} height={12} fill={t.roof} />
      <rect x={-13} y={-12} width={3} height={3} fill={t.window} />
      <rect x={10} y={-12} width={3} height={3} fill={t.window} />
    </g>
  ),
  "cypress-tree": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <path d="M 0 0 Q -4 -10 -2 -22 Q -3 -30 0 -34 Q 3 -30 2 -22 Q 4 -10 0 0 Z" fill={"#3F6F50"} />
    </g>
  ),
  "olive-tree": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-1} y={-12} width={2} height={12} fill={t.groundShade} />
      <ellipse cx={-3} cy={-16} rx={6} ry={4} fill={"#A2B97C"} />
      <ellipse cx={3} cy={-15} rx={5} ry={3.5} fill={"#A2B97C"} />
      <ellipse cx={0} cy={-19} rx={5} ry={3} fill={"#A2B97C"} />
    </g>
  ),
  "cathedral-spire": ({ t, cx, scale }) => (
    <g transform={`translate(${cx} ${BASELINE}) scale(${scale})`}>
      <rect x={-10} y={-26} width={20} height={26} fill={t.buildingLight} />
      <polygon points={`-12,-26 0,-58 12,-26`} fill={t.roof} />
      <rect x={-2} y={-66} width={4} height={8} fill={t.roof} />
      <circle cx={0} cy={-68} r={1.4} fill={t.accent} />
      <rect x={-7} y={-22} width={4} height={6} fill={t.window} />
      <rect x={3} y={-22} width={4} height={6} fill={t.window} />
    </g>
  ),
};

// ---------- Top-level renderer ----------

export function PostcardSvg({
  postcard,
  city,
  className,
  ariaLabel,
}: {
  postcard: Postcard;
  city: string;
  className?: string;
  ariaLabel?: string;
}) {
  const baseTones = PALETTE_TONES[postcard.palette] ?? PALETTE_TONES.warm;
  const t = applySky(baseTones, postcard.sky);
  const stamp = (postcard.stamp ?? city).toUpperCase();
  const isNight = postcard.sky === "night";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label={ariaLabel ?? `${stamp.toLowerCase()} postcard`}
    >
      <defs>
        <linearGradient id={`sky-${postcard.sky}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={t.skyTop} />
          <stop offset="100%" stopColor={t.skyBottom} />
        </linearGradient>
      </defs>
      <rect width={VIEW_W} height={VIEW_H} fill={`url(#sky-${postcard.sky})`} />

      {/* Sun / moon */}
      <circle
        cx={isNight ? 168 : 160}
        cy={isNight ? 28 : 32}
        r={isNight ? 9 : 13}
        fill={t.sun}
        opacity={isNight ? 0.95 : 0.9}
      />
      {isNight && (
        <g fill="#FFFFFF" opacity={0.85}>
          {[
            [25, 18], [50, 28], [80, 14], [110, 26], [140, 18], [60, 50], [100, 44], [130, 56],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.7} />
          ))}
        </g>
      )}

      {/* Distant haze / hill backdrop hints at depth */}
      {postcard.ground !== "snow" && (
        <path
          d={`M 0 ${BASELINE - 8} Q 50 ${BASELINE - 14} 100 ${BASELINE - 8} T 200 ${BASELINE - 4} L 200 ${BASELINE} L 0 ${BASELINE} Z`}
          fill={t.accent}
          opacity={0.35}
        />
      )}

      {/* Elements, ordered back-to-front by array position */}
      {postcard.elements.map((el, idx) => renderElement(el, t, idx))}

      {/* Ground band */}
      <GroundBand ground={postcard.ground} t={t} />

      {/* Postcard stamp */}
      <g transform={`translate(${VIEW_W - 56} 8)`}>
        <rect width={48} height={18} rx={2} fill="#FFFBF3" stroke={t.roof} strokeWidth={0.6} />
        <rect x={2} y={2} width={44} height={14} fill="none" stroke={t.roof} strokeWidth={0.3} strokeDasharray="1.4 1.2" />
        <text
          x={24}
          y={13}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize={7}
          letterSpacing={1.1}
          fontWeight={700}
          fill={t.roof}
        >
          {stamp.length > 11 ? stamp.slice(0, 11) : stamp}
        </text>
      </g>

      {/* Tiny caption strip bottom-left so the postcard reads like a postcard */}
      <text
        x={6}
        y={VIEW_H - 4}
        fontFamily="monospace"
        fontSize={6}
        letterSpacing={0.8}
        fill={t.roof}
        opacity={0.6}
      >
        SWAPL · {stamp}
      </text>
    </svg>
  );
}

function renderElement(inst: PostcardElementInstance, t: Tones, idx: number): React.ReactElement {
  const renderer = E[inst.type];
  if (!renderer) return <g key={idx} />;
  const x = Math.max(0.04, Math.min(0.96, inst.x ?? 0.5)) * VIEW_W;
  const scale = Math.max(0.4, Math.min(1.6, inst.scale ?? 1));
  return <g key={idx}>{renderer({ t, cx: x, scale, flip: inst.flip ?? false })}</g>;
}

function GroundBand({ ground, t }: { ground: Ground; t: Tones }) {
  if (ground === "water") {
    return (
      <g>
        <rect x={0} y={BASELINE} width={VIEW_W} height={VIEW_H - BASELINE} fill={t.accent} opacity={0.55} />
        <path d={`M 0 ${BASELINE + 4} Q 25 ${BASELINE + 2} 50 ${BASELINE + 4} T 100 ${BASELINE + 4} T 200 ${BASELINE + 4}`} stroke={t.window} strokeWidth={0.6} fill="none" />
        <path d={`M 0 ${BASELINE + 10} Q 30 ${BASELINE + 8} 60 ${BASELINE + 10} T 150 ${BASELINE + 10}`} stroke={t.window} strokeWidth={0.4} fill="none" />
      </g>
    );
  }
  if (ground === "sand") {
    return <rect x={0} y={BASELINE} width={VIEW_W} height={VIEW_H - BASELINE} fill={t.ground} />;
  }
  if (ground === "grass") {
    return (
      <g>
        <rect x={0} y={BASELINE} width={VIEW_W} height={VIEW_H - BASELINE} fill={"#A2B97C"} />
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={i} x1={i * 14 + 4} y1={BASELINE + 6} x2={i * 14 + 6} y2={BASELINE + 2} stroke={"#3F6F50"} strokeWidth={0.5} />
        ))}
      </g>
    );
  }
  if (ground === "snow") {
    return <rect x={0} y={BASELINE} width={VIEW_W} height={VIEW_H - BASELINE} fill={"#FFFFFF"} />;
  }
  // street
  return (
    <g>
      <rect x={0} y={BASELINE} width={VIEW_W} height={VIEW_H - BASELINE} fill={t.ground} />
      <line x1={0} y1={BASELINE + 8} x2={VIEW_W} y2={BASELINE + 8} stroke={t.groundShade} strokeWidth={0.4} strokeDasharray="3 4" />
    </g>
  );
}
