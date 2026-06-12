// Postcard city stamp — the same visual language as the stamp in the corner
// of the browse-card postcards (components/illustrations/postcard.tsx):
// cream paper, thin outer frame, inner dashed border, monospace uppercase
// city. Used on the public profile's "Where I've been" strip, one stamp per
// visited city + year (from COMPLETED agreements — real data only).

export function CityStamp({
  city,
  country,
  year,
  tilt = 0,
}: {
  city: string;
  country: string;
  year: number;
  tilt?: number;
}) {
  return (
    <div
      className="shrink-0 rounded-[4px] px-1 py-1"
      style={{
        background: "#FFFBF3",
        border: "1px solid var(--navy)",
        boxShadow: "2px 2px 0 color-mix(in oklab, var(--navy) 12%, transparent)",
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    >
      <div
        className="flex flex-col items-center justify-center px-4 py-3 min-w-[120px]"
        style={{ border: "1px dashed var(--navy-3)", borderRadius: 2 }}
      >
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[.14em] whitespace-nowrap"
          style={{ color: "var(--navy)" }}
        >
          {city.length > 14 ? city.slice(0, 14) : city}
        </span>
        <span
          className="mt-0.5 font-mono text-[9px] uppercase tracking-[.12em] whitespace-nowrap"
          style={{ color: "var(--navy-3)" }}
        >
          {(country.length > 14 ? country.slice(0, 14) : country)} · {year}
        </span>
      </div>
    </div>
  );
}
