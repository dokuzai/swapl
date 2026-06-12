"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { statusDotColor } from "./status-pill";
import type { Conversation } from "./conversations";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "hosting", label: "Hosting" },
  { key: "traveling", label: "Traveling" },
  { key: "archived", label: "Archived" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COUNTERED: "Countered",
  ACCEPTED: "Active swap",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function isArchivedStatus(status: string): boolean {
  return status === "DECLINED" || status === "WITHDRAWN";
}

// Master list pane of the three-pane swaps inbox (DOK-150). Rendered full
// width on mobile (/swaps) and as the left column on desktop.
export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId?: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "hosting" && (c.role !== "hosting" || isArchivedStatus(c.status))) return false;
      if (filter === "traveling" && (c.role !== "traveling" || isArchivedStatus(c.status))) return false;
      if (filter === "archived" && !isArchivedStatus(c.status)) return false;
      if (filter === "all" && isArchivedStatus(c.status)) return false;
      if (!q) return true;
      const hay = `${c.otherName ?? ""} ${c.theirCity} ${c.theirNeighbourhood} ${c.myCity} ${c.myNeighbourhood}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, filter, query]);

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div role="tablist" aria-label="Filter conversations" className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className="font-mono text-[11px] uppercase tracking-[.08em] px-3.5 py-1.5 rounded-full border whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={
                active
                  ? { background: "var(--navy)", color: "var(--cream)", borderColor: "var(--navy)" }
                  : { background: "transparent", color: "var(--navy-2)", borderColor: "var(--line)" }
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <label className="block">
        <span className="sr-only">Search conversations</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or city"
          className="w-full px-3.5 py-2 rounded-full border outline-none text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>

      {visible.length === 0 ? (
        <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
          {conversations.length === 0
            ? "No conversations yet. Propose a swap from any listing to start one."
            : "Nothing here — try another filter or search."}
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Conversations">
          {visible.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <Link
                  href={`/swaps/${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    "surface-card flex items-center gap-3 p-3 hover:no-underline" +
                    (isArchivedStatus(c.status) ? " opacity-70" : "")
                  }
                  style={active ? { outline: "2px solid var(--pink)", outlineOffset: "-2px" } : undefined}
                >
                  <span
                    className="block w-11 h-11 rounded-full overflow-hidden border shrink-0"
                    style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
                    aria-hidden
                  >
                    <CityIllust city={c.theirCity} palette={paletteForCity(c.theirCity)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[15px] tracking-[-0.01em] truncate">
                        {c.otherName ?? "swapl host"} · {c.theirCity}
                      </span>
                      <span className="font-mono text-[10px] shrink-0" style={{ color: "var(--navy-3)" }}>
                        {shortDate(c.updatedAt)}
                      </span>
                    </span>
                    <span className="block text-xs truncate mt-0.5" style={{ color: "var(--navy-2)" }}>
                      {c.lastLine ?? `${c.myNeighbourhood} ⇄ ${c.theirNeighbourhood}`}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block"
                        style={{ background: statusDotColor(c.status) }}
                        aria-hidden
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                        {STATUS_LABEL[c.status] ?? c.status} · {c.role}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
