"use client";

// Airbnb-style header center for signed-in users (DOK-150).
//
// Approach (chosen for simplicity + robustness, no scroll listeners):
// - On browse-ish pages (/listings, /dashboard) the center slot shows the
//   three category tabs (Homes / Experiences / Services) that flip the
//   `tab` search param on /listings.
// - On every other product page the tabs collapse into a compact search
//   pill (Where · Dates · Who). The pill is a pure entry point: it links to
//   /listings#browse-filters, where the existing FilterSidebar lives — no
//   new search logic.
// - Mobile: the same component renders as a horizontally scrollable tab row
//   (or a full-width pill) in a second header row, via the `variant` prop.

import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type HeaderNavLabels = {
  tabsAria: string;
  homes: string;
  experiences: string;
  services: string;
  newBadge: string;
  searchWhere: string;
  searchDates: string;
  searchWho: string;
  searchLabel: string;
};

/** Pages where the category tabs make sense; everywhere else → search pill. */
const TAB_PATHS = new Set(["/listings", "/dashboard"]);

function StrokeIcon({ d, size = 18, style }: { d: string; size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      <path d={d} />
    </svg>
  );
}

// Same hand-drafted line style as the browse chips.
const ICONS = {
  house: "M3 11l9-8 9 8M5 9.5V21h14V9.5M9 21v-6h6v6",
  ticket:
    "M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4V8zM13 6v2m0 3v2m0 3v2",
  bell: "M6 17h12a1 1 0 00.8-1.6C17.7 13.9 18 12.6 18 10a6 6 0 10-12 0c0 2.6.3 3.9-.8 5.4A1 1 0 006 17zM10 20a2 2 0 004 0",
  search: "M11 4a7 7 0 105.2 11.7L21 21M11 4a7 7 0 017 7",
} as const;

function CategoryTab({
  href,
  icon,
  label,
  active,
  isNew,
  newLabel,
}: {
  href: string;
  icon: keyof typeof ICONS;
  label: string;
  active: boolean;
  isNew?: boolean;
  newLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="relative flex flex-col items-center gap-1 px-3 pt-3 pb-2 shrink-0 transition-colors"
      style={{
        color: active ? "var(--navy)" : "color-mix(in oklab, var(--navy) 60%, transparent)",
      }}
    >
      <StrokeIcon d={ICONS[icon]} />
      <span className={`text-[13px] leading-none ${active ? "font-medium" : ""}`}>{label}</span>
      {isNew && (
        <span
          className="absolute top-0 right-1 font-mono text-[8px] uppercase tracking-[.08em] leading-none px-1 py-px rounded-full"
          style={{ background: "var(--pink-light)", color: "var(--pink)" }}
        >
          {newLabel}
        </span>
      )}
      <span
        aria-hidden
        className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full transition-opacity"
        style={{ background: "var(--navy)", opacity: active ? 1 : 0 }}
      />
    </Link>
  );
}

function CategoryTabs({ labels, variant }: { labels: HeaderNavLabels; variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Active tab only meaningful on /listings; on /dashboard nothing is active.
  const rawTab = sp.get("tab");
  const active =
    pathname === "/listings"
      ? rawTab === "experiences" || rawTab === "services"
        ? rawTab
        : "homes"
      : null;

  return (
    <nav
      aria-label={labels.tabsAria}
      className={
        variant === "desktop"
          ? "flex items-end justify-center gap-2"
          : "flex items-end gap-2 overflow-x-auto px-4 pb-1 -mb-1"
      }
    >
      <CategoryTab
        href="/listings"
        icon="house"
        label={labels.homes}
        active={active === "homes"}
        newLabel={labels.newBadge}
      />
      <CategoryTab
        href="/listings?tab=experiences"
        icon="ticket"
        label={labels.experiences}
        active={active === "experiences"}
        isNew
        newLabel={labels.newBadge}
      />
      <CategoryTab
        href="/listings?tab=services"
        icon="bell"
        label={labels.services}
        active={active === "services"}
        isNew
        newLabel={labels.newBadge}
      />
    </nav>
  );
}

function SearchPill({ labels, variant }: { labels: HeaderNavLabels; variant: "desktop" | "mobile" }) {
  return (
    <Link
      href="/listings#browse-filters"
      aria-label={labels.searchLabel}
      className={`inline-flex items-center rounded-full border border-line text-sm transition-shadow hover:shadow-md ${
        variant === "mobile" ? "mx-4 mb-1 w-[calc(100%-2rem)] justify-between" : ""
      }`}
      style={{ background: "var(--cream)", padding: "6px 6px 6px 16px" }}
    >
      <span className="flex items-center min-w-0">
        <span className="font-medium pr-3 whitespace-nowrap">{labels.searchWhere}</span>
        <span aria-hidden className="h-5 w-px shrink-0" style={{ background: "var(--line)" }} />
        <span className="px-3 whitespace-nowrap" style={{ color: "var(--navy-2)" }}>
          {labels.searchDates}
        </span>
        <span aria-hidden className="h-5 w-px shrink-0" style={{ background: "var(--line)" }} />
        <span className="px-3 whitespace-nowrap" style={{ color: "var(--navy-2)" }}>
          {labels.searchWho}
        </span>
      </span>
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0"
        style={{ background: "var(--pink)", color: "var(--cream)" }}
      >
        <StrokeIcon d={ICONS.search} size={14} />
      </span>
    </Link>
  );
}

function HeaderNavInner({ labels, variant }: { labels: HeaderNavLabels; variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const showTabs = TAB_PATHS.has(pathname);
  return showTabs ? (
    <CategoryTabs labels={labels} variant={variant} />
  ) : (
    <SearchPill labels={labels} variant={variant} />
  );
}

/**
 * Center slot of the signed-in header. `variant="desktop"` renders inline in
 * the nav row (hidden on mobile by the caller); `variant="mobile"` renders a
 * second, scrollable header row.
 */
export function HeaderNav({ labels, variant }: { labels: HeaderNavLabels; variant: "desktop" | "mobile" }) {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <HeaderNavInner labels={labels} variant={variant} />
    </Suspense>
  );
}
