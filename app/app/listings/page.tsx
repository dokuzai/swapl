import { Suspense } from "react";
import Link from "next/link";
import { ListingCard } from "@/components/listing/listing-card";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { parseFiltersFromSearchParams, filtersToQuery } from "@/lib/listing-filters";
import { queryListings, getViewerListing } from "@/lib/listing-query";
import { getSession } from "@/lib/auth/session";
import SortControl from "./sort-control";
import ViewToggle from "./view-toggle";
import { ListingsMap } from "@/components/map/listings-map";
import { getDictionary, t as tt } from "@/lib/i18n/server";

export const metadata = {
  title: "Browse homes · swapl",
  description: "Explore homes ready to swap across 92 countries.",
};

export const dynamic = "force-dynamic";

export default async function ListingsPage(props: PageProps<"/listings">) {
  const sp = await props.searchParams;
  const filters = parseFiltersFromSearchParams(sp as Record<string, string | string[] | undefined>);
  const session = await getSession();
  const viewerListing = await getViewerListing(session?.userId);

  const view: "grid" | "map" = (Array.isArray(sp?.view) ? sp?.view[0] : sp?.view) === "map" ? "map" : "grid";

  const { items, total, pageSize, page } = await queryListings(filters, viewerListing);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const dict = await getDictionary();

  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-8">
        <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] font-medium">
          {dict["listings.title"]}
        </h1>
        <p className="mt-3 max-w-2xl text-[16px]" style={{ color: "var(--navy-2)" }}>
          {total.toLocaleString()} {dict["listings.totalSuffix"]}
        </p>
        {viewerListing ? (
          <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-full text-sm" style={{ background: "var(--pink-light)", color: "var(--navy)" }}>
            {dict["listings.matchingAgainst"]}{" "}
            <span className="font-medium">
              {viewerListing.neighbourhood} · {viewerListing.city}
            </span>
          </div>
        ) : (
          <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-full text-sm" style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}>
            <Link href="/listings/new" className="font-medium" style={{ color: "var(--pink)" }}>
              {dict["listings.listFirst.cta"]}
            </Link>
            <span>{dict["listings.listFirst.body"]}</span>
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <Suspense>
          <FilterSidebar resultCount={total} />
        </Suspense>

        <section>
          <div
            className="flex items-baseline justify-between mb-5 pb-4"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <div className="font-display text-[22px] tracking-[-0.01em] font-medium">
              <b style={{ color: "var(--pink)", fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString()}</b> {dict["filter.homesReady"]}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Suspense>
                <ViewToggle current={view} />
              </Suspense>
              <Suspense>
                <SortControl />
              </Suspense>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="surface-card p-10 text-center">
              <h2 className="font-display text-2xl mb-2">{dict["listings.empty.title"]}</h2>
              <p className="mb-5" style={{ color: "var(--navy-2)" }}>
                {dict["listings.empty.body"]}
              </p>
              <Link href="/listings" className="pill-primary">
                {dict["listings.empty.reset"]}
              </Link>
            </div>
          ) : view === "map" ? (
            <ListingsMap listings={items.map((i) => i.listing)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {items.map(({ listing, matchScore }) => (
                <ListingCard key={listing.id} listing={listing} matchScore={matchScore} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-between gap-3">
              <PageLink page={page - 1} disabled={page <= 1} sp={sp} label={dict["listings.previous"]} />
              <span className="text-sm" style={{ color: "var(--navy-3)" }}>
                {tt(dict, "listings.pageOf", { n: page, total: totalPages })}
              </span>
              <PageLink page={page + 1} disabled={page >= totalPages} sp={sp} label={dict["listings.next"]} />
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  sp,
  label,
}: {
  page: number;
  disabled: boolean;
  sp: Record<string, string | string[] | undefined>;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="opacity-40 pill-ghost" aria-disabled>
        {label}
      </span>
    );
  }
  const filters = parseFiltersFromSearchParams(sp);
  const qs = filtersToQuery({ ...filters, page });
  return (
    <Link href={qs ? `/listings?${qs}` : "/listings"} className="pill-ghost">
      {label}
    </Link>
  );
}
