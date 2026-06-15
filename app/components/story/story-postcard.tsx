"use client";

// A single "postcard stamp" for the Swapl story timeline (DOK-158). Reuses the
// brand stamp visual language from the public-profile CityStamp / browse-card
// postcards (cream paper, thin outer frame, inner dashed border, monospace
// uppercase city) and adds a kind ribbon so a TRIP (a place you stayed) reads
// differently from a HOSTING (a guest you welcomed): trips wear a pink ribbon,
// hostings a navy one. Pure presentational — no server imports.

import type { StoryEventKind } from "@/lib/story";

export function StoryPostcard({
  kind,
  city,
  country,
  year,
  dateRange,
  counterpart,
  kindLabel,
  tilt = 0,
}: {
  kind: StoryEventKind;
  city: string;
  country: string;
  year: number;
  dateRange: string;
  /** Already-localised "Hosted by Ana" / "You hosted Ana" / fallback line. */
  counterpart: string;
  /** Already-localised ribbon label ("Stayed" / "Hosted"). */
  kindLabel: string;
  tilt?: number;
}) {
  const isTrip = kind === "trip";
  const ribbonBg = isTrip ? "var(--pink)" : "var(--navy)";

  return (
    <div
      className="relative shrink-0 rounded-[6px] px-1.5 py-1.5"
      style={{
        background: "#FFFBF3",
        border: "1px solid var(--navy)",
        boxShadow: "3px 3px 0 color-mix(in oklab, var(--navy) 14%, transparent)",
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    >
      {/* Kind ribbon — top-right corner stamp. */}
      <span
        className="absolute -top-2 -right-2 z-10 font-mono text-[9px] font-bold uppercase tracking-[.12em] px-2 py-0.5 rounded-full"
        style={{ background: ribbonBg, color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }}
      >
        {kindLabel}
      </span>

      <div
        className="flex flex-col items-center justify-center px-5 py-4 min-w-[150px]"
        style={{ border: "1px dashed var(--navy-3)", borderRadius: 3 }}
      >
        <span
          className="font-mono text-[13px] font-bold uppercase tracking-[.14em] whitespace-nowrap"
          style={{ color: "var(--navy)" }}
        >
          {city.length > 16 ? city.slice(0, 16) : city}
        </span>
        <span
          className="mt-0.5 font-mono text-[9px] uppercase tracking-[.12em] whitespace-nowrap"
          style={{ color: "var(--navy-3)" }}
        >
          {(country.length > 16 ? country.slice(0, 16) : country)} · {year}
        </span>
        <span className="mt-2 text-[12px] text-center leading-tight" style={{ color: "var(--navy-2)" }}>
          {counterpart}
        </span>
        <span className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--navy-3)" }}>
          {dateRange}
        </span>
      </div>
    </div>
  );
}
