"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { useT, useLocale } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";
import { statusDotColor } from "./status-pill";
import type { Conversation } from "./conversations";

const FILTERS = [
  { key: "all", labelKey: "swaps.tab.all" },
  { key: "hosting", labelKey: "swaps.tab.hosting" },
  { key: "traveling", labelKey: "swaps.tab.traveling" },
  { key: "archived", labelKey: "swaps.tab.archived" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: DictKey }>;

type FilterKey = (typeof FILTERS)[number]["key"];

const SORTS = [
  { key: "recent", labelKey: "swaps.sort.recent" },
  { key: "unread", labelKey: "swaps.sort.unread" },
  { key: "checkIn", labelKey: "swaps.sort.checkIn" },
  { key: "name", labelKey: "swaps.sort.name" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: DictKey }>;

type SortKey = (typeof SORTS)[number]["key"];

const GROUPS = [
  { key: "none", labelKey: "swaps.group.none" },
  { key: "role", labelKey: "swaps.group.role" },
  { key: "status", labelKey: "swaps.group.status" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: DictKey }>;

type GroupKey = (typeof GROUPS)[number]["key"];

const STATUS_KEY: Record<string, DictKey> = {
  PENDING: "swaps.status.pending",
  COUNTERED: "swaps.status.countered",
  ACCEPTED: "swaps.status.accepted",
  DECLINED: "swaps.status.declined",
  WITHDRAWN: "swaps.status.withdrawn",
};

const ROLE_KEY: Record<string, DictKey> = {
  hosting: "swaps.tab.hosting",
  traveling: "swaps.tab.traveling",
};

// Locale-aware "23 ago" style short date — Intl renders the month in the
// active locale (IT "23 ago", EN "23 Aug). UTC so the day matches the server.
function shortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function isArchivedStatus(status: string): boolean {
  return status === "DECLINED" || status === "WITHDRAWN";
}

// Master list pane of the three-pane swaps inbox (DOK-150). Rendered full
// width on mobile (/swaps) and as the left column on desktop.
const CONV_POLL_MS = 10000;

export function ConversationList({
  conversations: initial,
  activeId,
}: {
  conversations: Conversation[];
  activeId?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [query, setQuery] = useState("");
  // Seed from the server render, then keep the list fresh (last message,
  // unread badges, reordering) with light polling while the tab is visible.
  const [conversations, setConversations] = useState<Conversation[]>(initial);

  useEffect(() => {
    setConversations(initial);
  }, [initial]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: Conversation[] };
        if (alive) setConversations(data.conversations);
      } catch {
        // keep the last good list
      }
    }
    const timer = setInterval(refresh, CONV_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recency = (c: Conversation) => c.lastMessageAt ?? c.updatedAt;
    return conversations
      .filter((c) => {
        if (filter === "hosting" && (c.role !== "hosting" || isArchivedStatus(c.status))) return false;
        if (filter === "traveling" && (c.role !== "traveling" || isArchivedStatus(c.status))) return false;
        if (filter === "archived" && !isArchivedStatus(c.status)) return false;
        if (filter === "all" && isArchivedStatus(c.status)) return false;
        if (!q) return true;
        const hay = `${c.otherName ?? ""} ${c.theirCity} ${c.theirNeighbourhood} ${c.myCity} ${c.myNeighbourhood}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "unread": {
            // Unread threads first, then most recent within each bucket.
            const au = a.unreadCount > 0 ? 1 : 0;
            const bu = b.unreadCount > 0 ? 1 : 0;
            if (au !== bu) return bu - au;
            return recency(b).localeCompare(recency(a));
          }
          case "checkIn":
            // Soonest check-in first.
            return a.dateFrom.localeCompare(b.dateFrom);
          case "name":
            return (a.otherName ?? "").localeCompare(b.otherName ?? "");
          case "recent":
          default:
            // Most recently active first: a fresh message outranks an old update.
            return recency(b).localeCompare(recency(a));
        }
      });
  }, [conversations, filter, query, sortBy]);

  // `visible`, split into titled sections per Group-by (None = one untitled
  // section). Groups appear in a stable order.
  const grouped = useMemo<{ key: string; title: string | null; items: Conversation[] }[]>(() => {
    if (groupBy === "none") return [{ key: "all", title: null, items: visible }];
    if (groupBy === "role") {
      return (["hosting", "traveling"] as const)
        .map((role) => ({
          key: role,
          title: t(ROLE_KEY[role]),
          items: visible.filter((c) => c.role === role),
        }))
        .filter((g) => g.items.length > 0);
    }
    // Group by status, ordered by first appearance in the sorted list.
    const order: string[] = [];
    const byStatus = new Map<string, Conversation[]>();
    for (const c of visible) {
      if (!byStatus.has(c.status)) {
        order.push(c.status);
        byStatus.set(c.status, []);
      }
      byStatus.get(c.status)!.push(c);
    }
    return order.map((s) => ({
      key: s,
      title: STATUS_KEY[s] ? t(STATUS_KEY[s]) : s,
      items: byStatus.get(s) ?? [],
    }));
  }, [visible, groupBy, t]);

  const renderConversation = (c: Conversation) => {
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
              <span className="flex items-center gap-1.5 shrink-0">
                {c.unreadCount > 0 && !active && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center font-mono text-[10px] leading-none"
                    style={{ background: "var(--pink)", color: "var(--cream)" }}
                    aria-label={t("swaps.inbox.unread", { n: c.unreadCount })}
                  >
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
                <span className="font-mono text-[10px]" style={{ color: "var(--navy-3)" }}>
                  {shortDate(c.lastMessageAt ?? c.updatedAt, locale)}
                </span>
              </span>
            </span>
            <span
              className="block text-xs truncate mt-0.5"
              style={{
                color: c.unreadCount > 0 && !active ? "var(--navy)" : "var(--navy-2)",
                fontWeight: c.unreadCount > 0 && !active ? 600 : 400,
              }}
            >
              {c.lastLine ?? `${c.myNeighbourhood} ⇄ ${c.theirNeighbourhood}`}
            </span>
            <span className="flex items-center gap-1.5 mt-1">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: statusDotColor(c.status) }}
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {STATUS_KEY[c.status] ? t(STATUS_KEY[c.status]) : c.status} ·{" "}
                {ROLE_KEY[c.role] ? t(ROLE_KEY[c.role]) : c.role}
              </span>
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div role="tablist" aria-label={t("swaps.inbox.search")} className="flex gap-2 overflow-x-auto pb-1 -mb-1">
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
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        <label className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("swaps.inbox.orderBy")}
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="font-mono text-[11px] px-2.5 py-1 rounded-full border outline-none bg-transparent cursor-pointer"
            style={{ borderColor: "var(--line)", color: "var(--navy-2)" }}
            aria-label={t("swaps.inbox.orderBy")}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("swaps.inbox.groupBy")}
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupKey)}
            className="font-mono text-[11px] px-2.5 py-1 rounded-full border outline-none bg-transparent cursor-pointer"
            style={{ borderColor: "var(--line)", color: "var(--navy-2)" }}
            aria-label={t("swaps.inbox.groupBy")}
          >
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {t(g.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="sr-only">{t("swaps.inbox.search")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("swaps.inbox.search")}
          className="w-full px-3.5 py-2 rounded-full border outline-none text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>

      {visible.length === 0 ? (
        <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
          {conversations.length === 0 ? t("swaps.empty.body") : t("swaps.select.body")}
        </div>
      ) : groupBy === "none" ? (
        <ul className="space-y-2" aria-label={t("swaps.inbox.conversations")}>
          {visible.map(renderConversation)}
        </ul>
      ) : (
        <div className="flex flex-col gap-4" aria-label={t("swaps.inbox.conversations")}>
          {grouped.map((g) => (
            <div key={g.key}>
              {g.title && (
                <h3 className="font-mono text-[10px] uppercase tracking-[.08em] mb-1.5 px-1" style={{ color: "var(--navy-3)" }}>
                  {g.title}
                </h3>
              )}
              <ul className="space-y-2">{g.items.map(renderConversation)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
