"use client";

// Airbnb-style horizontal shelves for the /listings browse (DOK-150), in the
// Swapl skin: surface-card tiles, kicker headers, match-badge, pink accents.
//
// Three shelves above the results grid:
//   1. "Picked for you"   — /api/ai/suggestions (existing endpoint, logged-in only)
//   2. "Recently viewed"  — localStorage snapshots written by the detail page
//   3. "Explore top cities" — server-computed top cities passed as props
//
// Layout: scroll-snap rows, swipe on mobile, arrow buttons on desktop only
// (lg:). Every shelf hides itself entirely when it has nothing to show, so
// the page degrades to exactly the old browse.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import { FavoriteHeart } from "@/components/listing/favorite-heart";
import { readRecentlyViewed, type RecentlyViewedEntry } from "@/lib/recently-viewed";
import { useT } from "@/lib/i18n/client";
import type { ListingDTO } from "@/lib/listing-utils";

export type ShelfCity = {
  city: string;
  country: string;
  count: number;
  photo: { url: string; alt: string } | null;
};

type SuggestionItem = { listing: ListingDTO; matchScore: number; reason: string; source: "ai" | "fallback" };

/* ----------------------------------------------------------------
   Generic shelf: header + scroll-snap row + desktop-only arrows.
   ---------------------------------------------------------------- */

function Shelf({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  function scrollBy(dir: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    const from = el.scrollLeft;
    const to = Math.max(0, Math.min(from + dir * Math.round(el.clientWidth * 0.9), el.scrollWidth - el.clientWidth));
    el.scrollTo({ left: to, behavior: "smooth" });
    // Some engines silently drop smooth scrolling on snap-mandatory rows (and
    // any animated scroll stalls in hidden tabs) — if nothing moved, jump.
    window.setTimeout(() => {
      if (Math.abs(el.scrollLeft - from) < 2 && from !== to) el.scrollLeft = to;
      updateArrows();
    }, 250);
  }

  return (
    <section aria-label={title} data-shelf={id} className="mb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="kicker">{kicker}</p>
          <h2 className="font-display text-2xl tracking-[-0.01em]">{title}</h2>
        </div>
        {/* Arrows: desktop only — on mobile the row is a plain swipe. */}
        <div className="hidden lg:flex items-center gap-2">
          <ShelfArrow dir={-1} label={t("shelves.scrollLeft")} disabled={!canLeft} onClick={() => scrollBy(-1)} />
          <ShelfArrow dir={1} label={t("shelves.scrollRight")} disabled={!canRight} onClick={() => scrollBy(1)} />
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}

function ShelfArrow({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: -1 | 1;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid place-items-center w-9 h-9 rounded-full transition-opacity cursor-pointer disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ border: "1px solid var(--line)", background: "var(--cream)", color: "var(--navy)", outlineColor: "var(--pink)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === -1 ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

const TILE = "snap-start shrink-0 w-[230px] sm:w-[260px]";

/* ----------------------------------------------------------------
   1. Picked for you — /api/ai/suggestions
   ---------------------------------------------------------------- */

function PickedForYouShelf() {
  const t = useT();
  const [items, setItems] = useState<SuggestionItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/suggestions")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { items: SuggestionItem[] };
      })
      .then((j) => !cancelled && setItems(j.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Errors (rate limit, transient) hide the shelf — the grid below is the page.
  if (failed || (items && items.length === 0)) return null;

  return (
    <Shelf id="picked-for-you" kicker={t("shelves.picked.kicker")} title={t("shelves.picked.title")}>
      {items === null
        ? [0, 1, 2, 3].map((i) => (
            <div key={i} className={`${TILE} surface-card--static overflow-hidden`}>
              <div className="aspect-[16/10] skeleton" />
              <div className="p-4 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))
        : items.map((it) => (
            <Link
              key={it.listing.id}
              href={`/listings/${it.listing.id}`}
              className={`${TILE} surface-card overflow-hidden block group`}
              aria-label={`${it.listing.title} in ${it.listing.city}`}
            >
              <div className="aspect-[16/10] relative overflow-hidden" style={{ background: "var(--cream-2)" }}>
                {it.listing.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.listing.photos[0]}
                    alt={`${it.listing.title} in ${it.listing.city}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <CityIllust
                    city={it.listing.city}
                    palette={it.listing.palette}
                    motif={it.listing.motif}
                    postcard={it.listing.postcard}
                  />
                )}
                <span className="absolute top-3 left-3 match-badge">
                  {t("shelves.match", { n: it.matchScore })}
                </span>
                <FavoriteHeart listingId={it.listing.id} />
              </div>
              <div className="p-4">
                <div className="font-display text-base tracking-[-0.01em] leading-tight">
                  {it.listing.neighbourhood} · {it.listing.city}
                </div>
                <p className="mt-1.5 text-[13px] leading-snug line-clamp-2" style={{ color: "var(--navy-2)" }}>
                  {it.reason}
                </p>
              </div>
            </Link>
          ))}
    </Shelf>
  );
}

/* ----------------------------------------------------------------
   2. Recently viewed — localStorage, hidden when empty.
   ---------------------------------------------------------------- */

function RecentlyViewedShelf() {
  const t = useT();
  // null until mounted: localStorage is browser-only, so first render (and
  // SSR) emits nothing — the hidden-if-empty guard also covers hydration.
  const [entries, setEntries] = useState<RecentlyViewedEntry[] | null>(null);

  useEffect(() => {
    setEntries(readRecentlyViewed());
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <Shelf id="recently-viewed" kicker={t("shelves.recent.kicker")} title={t("shelves.recent.title")}>
      {entries.map((e) => (
        <Link
          key={e.id}
          href={`/listings/${e.id}`}
          className={`${TILE} surface-card overflow-hidden block group`}
          aria-label={`${e.title} in ${e.city}`}
        >
          <div className="aspect-[16/10] relative overflow-hidden" style={{ background: "var(--cream-2)" }}>
            {e.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.photo} alt={`${e.title} in ${e.city}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
              <CityNamePlaceholder city={e.city} />
            )}
            <FavoriteHeart listingId={e.id} />
          </div>
          <div className="p-4">
            <div className="font-display text-base tracking-[-0.01em] leading-tight">
              {e.neighbourhood} · {e.city}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--navy-3)" }}>
              {e.country}
            </div>
          </div>
        </Link>
      ))}
    </Shelf>
  );
}

/* ----------------------------------------------------------------
   3. Explore top cities — server-computed props.
   ---------------------------------------------------------------- */

function CitiesShelf({ cities }: { cities: ShelfCity[] }) {
  const t = useT();
  if (cities.length === 0) return null;

  return (
    <Shelf id="explore-cities" kicker={t("shelves.cities.kicker")} title={t("shelves.cities.title")}>
      {cities.map((c) => (
        <Link
          key={`${c.city}|${c.country}`}
          href={`/listings?city=${encodeURIComponent(c.city)}`}
          className={`${TILE} surface-card overflow-hidden block group`}
          aria-label={`${c.city}, ${c.country}`}
        >
          <div className="aspect-[16/10] relative overflow-hidden" style={{ background: "var(--cream-2)" }}>
            {c.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photo.url} alt={c.photo.alt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
              <CityNamePlaceholder city={c.city} />
            )}
          </div>
          <div className="p-4 flex items-baseline justify-between gap-3">
            <div className="font-display text-base tracking-[-0.01em] leading-tight">{c.city}</div>
            <div className="text-[12px] font-mono whitespace-nowrap" style={{ color: "var(--navy-3)" }}>
              {t("shelves.cities.count", { n: c.count })}
            </div>
          </div>
        </Link>
      ))}
    </Shelf>
  );
}

/** Cream tile with the city name in the display face — photo fallback. */
function CityNamePlaceholder({ city }: { city: string }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      style={{ background: "linear-gradient(135deg, var(--cream-2), var(--pink-light))" }}
      aria-hidden
    >
      <span className="font-display text-2xl tracking-[-0.01em]" style={{ color: "var(--navy-2)" }}>
        {city}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------
   Composite export.
   ---------------------------------------------------------------- */

export function BrowseShelves({ loggedIn, cities }: { loggedIn: boolean; cities: ShelfCity[] }) {
  return (
    <div data-browse-shelves>
      {loggedIn && <PickedForYouShelf />}
      <RecentlyViewedShelf />
      <CitiesShelf cities={cities} />
    </div>
  );
}
