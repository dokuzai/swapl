// Tiny server-safe SVG charts for /admin (DOK-151). No client JS, no chart
// library — plain SVG rendered on the server, styled with the swapl tokens
// (navy bars on cream, pink highlight for the peak). Tooltips ride on native
// <title> elements.

import type { DailyBucket } from "@/lib/admin/metrics";

/** "2026-06-03" → "Jun 3" (UTC, abbreviated for the mono x-axis). */
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Daily bar chart: one navy bar per day, the busiest day highlighted in pink,
 * abbreviated mono dates on the x axis and a per-bar <title> tooltip.
 */
export function BarSeries({
  data,
  label,
  height = 120,
}: {
  data: DailyBucket[];
  label: string;
  height?: number;
}) {
  const width = 600;
  const padX = 6;
  const axisH = 18;
  const chartH = height - axisH;
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((a, d) => a + d.count, 0);
  const slot = (width - padX * 2) / Math.max(1, data.length);
  const barW = Math.max(2, slot * 0.62);

  // ~4 x-axis ticks, always including the first and last day.
  const tickEvery = Math.max(1, Math.ceil(data.length / 4));
  const ticks = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % tickEvery === 0 || i === data.length - 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${total} over ${data.length} days`}
      className="w-full h-auto block"
    >
      <line
        x1={padX}
        y1={chartH + 0.5}
        x2={width - padX}
        y2={chartH + 0.5}
        stroke="var(--line)"
        strokeWidth="1"
      />
      {data.map((d, i) => {
        const h = max === 0 ? 0 : Math.round((d.count / max) * (chartH - 8));
        const x = padX + i * slot + (slot - barW) / 2;
        const isPeak = d.count === max && d.count > 0;
        return (
          <rect
            key={d.day}
            x={x}
            y={chartH - h}
            width={barW}
            height={Math.max(h, d.count > 0 ? 2 : 0)}
            rx={1.5}
            fill={isPeak ? "var(--pink)" : "var(--navy)"}
            opacity={isPeak ? 1 : 0.85}
          >
            <title>{`${shortDay(d.day)} — ${d.count}`}</title>
          </rect>
        );
      })}
      {ticks.map(({ d, i }) => (
        <text
          key={d.day}
          x={padX + i * slot + slot / 2}
          y={height - 4}
          textAnchor={i === data.length - 1 ? "end" : i === 0 ? "start" : "middle"}
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--navy-3)"
        >
          {shortDay(d.day)}
        </text>
      ))}
    </svg>
  );
}

/** Compact trend line (navy) with the latest point marked in pink. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
}: {
  data: DailyBucket[];
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const pad = 3;
  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (d.count / max) * (height - pad * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const total = data.reduce((a, d) => a + d.count, 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Sparkline: ${total} over ${data.length} days`}
      width={width}
      height={height}
      className="block"
    >
      <title>{`${total} over the last ${data.length} days`}</title>
      <path d={path} fill="none" stroke="var(--navy-3)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="var(--pink)" />
    </svg>
  );
}
