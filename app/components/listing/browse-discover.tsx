// Browse chips (Homes / Experiences / Services) + the Experiences and
// Services grids for /listings (DOK-145). Server components only — the chips
// are plain links that flip the `tab` search param, so no client JS needed.
//
// Principles (same as lib/discover.ts):
// - Env-gated: a chip only renders when its endpoint has content, so with no
//   AFF_* ids the page is exactly the old Homes browse.
// - Every affiliate CTA uses the /api/affiliate/{partner} URL the API
//   already built — clicks are logged before the 302.
// - NO invented prices: experience/partner cards carry no price; only
//   concierge add-ons show their real DB price.

import type { CSSProperties } from "react";
import Link from "next/link";
import type { DiscoverExperience, DiscoverService } from "@/lib/discover";
import type { Dict } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/server";

export type BrowseTab = "homes" | "experiences" | "services";

/* ----------------------------------------------------------------
   Small stroke icons, consistent with the hand-drafted line style.
   ---------------------------------------------------------------- */

function StrokeIcon({ d, size = 16, style }: { d: string; size?: number; style?: CSSProperties }) {
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

const ICON_PATHS: Record<string, string> = {
  // chips
  house: "M3 11l9-8 9 8M5 9.5V21h14V9.5M9 21v-6h6v6",
  ticket: "M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4V8zM13 6v2m0 3v2m0 3v2",
  bell: "M6 17h12a1 1 0 00.8-1.6C17.7 13.9 18 12.6 18 10a6 6 0 10-12 0c0 2.6.3 3.9-.8 5.4A1 1 0 006 17zM10 20a2 2 0 004 0",
  // service categories
  plane: "M10.5 13.5L3 11l1.5-1.5L10 10l4-4.5L9.5 3 11 1.5 17.5 5 21 1.5 22.5 3 19 6.5l3.5 6.5-1.5 1.5-2.5-4.5-4.5 4-.5 5.5L12 21l-1.5-7.5z",
  sim: "M7 3h7l4 4v14H7V3zM10 13h6M10 16h6M10 10h3",
  shield: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z",
  sparkles: "M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z",
  key: "M14 10a4 4 0 10-4 4c.4 0 .7 0 1-.1L12 15h2v2h2v2h3v-3l-5.1-5.1c.1-.3.1-.6.1-.9z",
  car: "M5 16l1.5-5.5A2 2 0 018.4 9h7.2a2 2 0 011.9 1.5L19 16M5 16h14M5 16v3h2v-2h10v2h2v-3M8 13h.01M16 13h.01",
  map: "M9 4l6 2 6-2v14l-6 2-6-2-6 2V6l6-2zM9 4v14M15 6v14",
  concierge: "M6 17h12a1 1 0 00.8-1.6C17.7 13.9 18 12.6 18 10a6 6 0 10-12 0c0 2.6.3 3.9-.8 5.4A1 1 0 006 17zM10 20a2 2 0 004 0",
};

function HintIcon({ hint, size = 18, style }: { hint: string; size?: number; style?: CSSProperties }) {
  return <StrokeIcon d={ICON_PATHS[hint] ?? ICON_PATHS.concierge} size={size} style={style} />;
}

/* ----------------------------------------------------------------
   Chips row — Airbnb-style pills under the page header. Horizontal
   scroll on mobile, no wrap. Only tabs with content get a chip.
   ---------------------------------------------------------------- */

export function BrowseChips({
  active,
  showExperiences,
  showServices,
  baseQuery,
  dict,
}: {
  active: BrowseTab;
  showExperiences: boolean;
  showServices: boolean;
  /** Current filter query (without `tab`), preserved across tab switches. */
  baseQuery: string;
  dict: Dict;
}) {
  // Homes-only state: a lone chip is just noise.
  if (!showExperiences && !showServices) return null;

  const chips: Array<{ tab: BrowseTab; icon: string; label: string }> = [
    { tab: "homes", icon: "house", label: dict["browse.chips.homes"] },
    ...(showExperiences
      ? [{ tab: "experiences" as const, icon: "ticket", label: dict["browse.chips.experiences"] }]
      : []),
    ...(showServices
      ? [{ tab: "services" as const, icon: "bell", label: dict["browse.chips.services"] }]
      : []),
  ];

  function hrefFor(tab: BrowseTab): string {
    const params = new URLSearchParams(baseQuery);
    if (tab === "homes") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    return qs ? `/listings?${qs}` : "/listings";
  }

  return (
    <nav
      aria-label={dict["browse.chips.ariaLabel"]}
      className="flex gap-2 overflow-x-auto pb-1 -mx-8 px-8 sm:mx-0 sm:px-0"
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((c) => {
        const isActive = c.tab === active;
        return (
          <Link
            key={c.tab}
            href={hrefFor(c.tab)}
            aria-current={isActive ? "page" : undefined}
            className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
            style={
              isActive
                ? { background: "var(--navy)", color: "var(--cream)", border: "1px solid var(--navy)" }
                : { background: "transparent", color: "var(--navy-2)", border: "1px solid var(--line)" }
            }
          >
            <HintIcon hint={c.icon} size={16} />
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ----------------------------------------------------------------
   Experiences grid — one card per city/theme from /api/discover/
   experiences. Photo from CityMedia when cached, otherwise a flat
   illustration block. No prices: the CTA goes to the partner.
   ---------------------------------------------------------------- */

const PARTNER_LABEL: Record<string, string> = { getyourguide: "GetYourGuide" };

export function ExperiencesGrid({ items, dict }: { items: DiscoverExperience[]; dict: Dict }) {
  return (
    <section>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {items.map((x) => {
          const partner = PARTNER_LABEL[x.partner] ?? x.partner;
          return (
            <a
              key={x.url}
              href={x.url}
              target="_blank"
              rel="noopener sponsored"
              className="surface-card overflow-hidden block hover:no-underline group"
            >
              {x.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={x.photo.url}
                  alt={x.photo.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                  style={{ borderBottom: "1px solid var(--line)" }}
                />
              ) : (
                <div
                  className="aspect-[4/3] w-full flex items-center justify-center"
                  style={{ background: "var(--pink-light)", borderBottom: "1px solid var(--line)", color: "var(--pink)" }}
                >
                  <HintIcon hint="ticket" size={40} />
                </div>
              )}
              <div className="p-5">
                <div className="mb-2 flex items-center gap-2 min-w-0">
                  <span className="tag-chip shrink-0">{partner}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[.08em] truncate" style={{ color: "var(--navy-3)" }}>
                    {x.city}
                    {x.country ? ` · ${x.country}` : ""}
                  </span>
                </div>
                <div className="font-display text-lg tracking-[-0.01em] font-medium mb-2 group-hover:underline break-words">
                  {x.title}
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--pink)" }}>
                  {t(dict, "browse.bookOn", { partner })} →
                </span>
              </div>
            </a>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] font-mono" style={{ color: "var(--navy-3)" }}>
        {dict["browse.disclosure"]}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------
   Services grid — affiliate partner cards (no prices) followed by
   concierge add-ons with their real catalogue prices.
   ---------------------------------------------------------------- */

function formatPrice(priceCents: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: (currency ?? "EUR").toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `€${(priceCents / 100).toFixed(2)}`;
  }
}

export function ServicesGrid({ items, dict }: { items: DiscoverService[]; dict: Dict }) {
  const partners = items.filter((s) => s.category !== "concierge");
  const concierge = items.filter((s) => s.category === "concierge");

  return (
    <section>
      {partners.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {partners.map((s) => (
            <a
              key={s.slug}
              href={s.url ?? "#"}
              target="_blank"
              rel="noopener sponsored"
              className="surface-card p-5 block hover:no-underline group"
            >
              <div className="mb-3 flex items-center gap-3 min-w-0">
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--pink-light)", color: "var(--pink)" }}
                >
                  <HintIcon hint={s.iconHint} size={18} />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-lg tracking-[-0.01em] font-medium truncate group-hover:underline">
                    {s.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                    {s.category}
                  </div>
                </div>
              </div>
              <p className="text-sm mb-3 break-words" style={{ color: "var(--navy-2)" }}>
                {s.tagline}
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--pink)" }}>
                {t(dict, "browse.bookOn", { partner: s.name })} →
              </span>
            </a>
          ))}
        </div>
      )}

      {concierge.length > 0 && (
        <>
          <div className="mt-10 mb-4 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {dict["browse.services.conciergeHeading"]}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {concierge.map((s) => (
              <div key={s.slug} className="surface-card surface-card--static p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--cream-2)", color: "var(--navy)" }}
                  >
                    <HintIcon hint={s.iconHint} size={18} />
                  </span>
                  {/* priceCents 0 = affiliate-priced add-on (transfer, eSIM):
                      the partner sets the price, so showing €0.00 would be an
                      invented price. Only real catalogue prices render. */}
                  {s.priceCents !== null && s.priceCents > 0 && (
                    <span className="font-display text-lg shrink-0">{formatPrice(s.priceCents, s.currency)}</span>
                  )}
                </div>
                <div className="font-display text-lg tracking-[-0.01em] font-medium mb-1 break-words">{s.name}</div>
                <p className="text-sm break-words" style={{ color: "var(--navy-2)" }}>
                  {s.tagline}
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  {dict["browse.services.conciergeNote"]}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {partners.length > 0 && (
        <p className="mt-4 text-[10px] font-mono" style={{ color: "var(--navy-3)" }}>
          {dict["browse.disclosure"]}
        </p>
      )}
    </section>
  );
}
