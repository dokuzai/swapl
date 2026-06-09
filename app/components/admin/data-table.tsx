// Minimal server-rendered table for admin queues. Matches the surface-card
// look used across /admin (see verifications) — no client JS needed.

import type { ReactNode } from "react";

export function AdminTable({
  headers,
  rows,
  emptyLabel = "Nothing yet.",
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid color-mix(in oklab, var(--navy) 12%, transparent)" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[.1em] font-normal whitespace-nowrap"
                style={{ color: "var(--navy-3)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid color-mix(in oklab, var(--navy) 6%, transparent)" }}
            >
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusPill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
      style={
        accent
          ? { background: "var(--pink)", color: "#fff" }
          : { background: "var(--cream-2)", color: "var(--navy-2)" }
      }
    >
      {label}
    </span>
  );
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}
