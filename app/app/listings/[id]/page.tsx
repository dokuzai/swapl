import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma, parseJSON } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { DiscoverCity, DiscoverCitySkeleton } from "@/components/listing/discover-city";
import { Attribution, HeroIllustration, ListingPhotoMosaic } from "@/components/listing/photo-lightbox";
import { ShareListingButton, SaveListingButton } from "@/components/listing/listing-actions";
import { getCityIllustration } from "@/lib/city-media";
import { toDTO, formatDateRange, amenityChips } from "@/lib/listing-utils";
import { CityIllust, SwapArrows, Pin } from "@/components/illustrations";
import { propertyLabel } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { getViewerListing } from "@/lib/listing-query";
import { computeMatchScore } from "@/lib/match/score";
import ProposeSwapButton from "./propose-swap-button";
import { StayWithKeys } from "./stay-with-keys";
import { VerifiedBadge, FeaturedRibbon } from "@/components/listing/badges";
import { RecentlyViewedTracker } from "@/components/listing/recently-viewed-tracker";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const l = await prisma.listing.findUnique({
    where: { id },
    include: { user: { select: { settings: true } } },
  });
  if (!l) return { title: "Listing not found · swapl" };
  const cover = parseJSON<string[]>(l.photos, [])[0];
  // Owner opted out of search-engine indexing → noindex (the listing is also
  // excluded from the sitemap, see app/sitemap.ts).
  const indexable = parseSettings(l.user.settings).searchEngineIndexing;
  return {
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
    title: `${l.neighbourhood} · ${l.city} — ${l.title} · swapl`,
    description: l.description.slice(0, 160),
    openGraph: {
      title: `${l.title} · ${l.city}`,
      description: l.description.slice(0, 160),
      url: `/listings/${l.id}`,
      // Cover photo so shared links (iMessage/WhatsApp/Slack) preview the
      // home; the site-wide opengraph-image stays the fallback.
      ...(cover ? { images: [{ url: cover, alt: `${l.title} in ${l.city}` }] } : {}),
    },
    twitter: {
      card: "summary_large_image" as const,
      title: `${l.title} · ${l.city}`,
      description: l.description.slice(0, 160),
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ListingDetailPage(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, bio: true, avatar: true } } },
  });
  if (!listing || !listing.isActive) notFound();

  const dto = toDTO(listing);
  const session = await getSession();
  const viewerListing = await getViewerListing(session?.userId);
  const isOwner = session?.userId === listing.userId;

  // Keys balance for the Stay-with-Keys mode (DOK-155). Only signed-in
  // non-owners can request a Keys stay; the host can't book their own home.
  const viewer = session && !isOwner
    ? await prisma.user.findUnique({ where: { id: session.userId }, select: { keysBalance: true } })
    : null;

  let matchScore: number | null = null;
  if (viewerListing && !isOwner) {
    matchScore = computeMatchScore(
      {
        sizeSqm: viewerListing.sizeSqm,
        sleeps: viewerListing.sleeps,
        availableFrom: new Date(viewerListing.availableFrom),
        availableTo: new Date(viewerListing.availableTo),
        petsAllowed: viewerListing.petsAllowed,
        wfhSetup: viewerListing.wfhSetup,
        stepFreeAccess: viewerListing.stepFreeAccess,
        city: viewerListing.city,
        neighbourhood: viewerListing.neighbourhood,
      },
      {
        sizeSqm: dto.sizeSqm,
        sleeps: dto.sleeps,
        availableFrom: new Date(dto.availableFrom),
        availableTo: new Date(dto.availableTo),
        petsAllowed: dto.petsAllowed,
        wfhSetup: dto.wfhSetup,
        stepFreeAccess: dto.stepFreeAccess,
        city: dto.city,
        neighbourhood: dto.neighbourhood,
      }
    );
  }

  // Host rating aggregate (published reviews only) — powers the
  // "Loved by swappers" card, Airbnb guest-favourite style.
  const ratingAgg = await prisma.swapReview.aggregate({
    where: { subjectId: listing.userId, status: "published" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const reviewCount = ratingAgg._count._all;
  const avgRating = reviewCount > 0 ? Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10 : null;
  const loved = (matchScore !== null && matchScore >= 75) || (avgRating !== null && avgRating >= 4.5);

  const chips = amenityChips(dto);
  const hasPhotos = dto.photos.length > 0;

  // Real CC-licensed illustration of the city (Openverse, cached 30 days in
  // CityMedia kind="illustration"; a cache miss fetches within the provider's
  // 4s timeout). With photos it demotes to the Discover section below; with
  // none found AND no photos → the linear SVG postcard hero, exactly as before.
  const heroIllustration = await getCityIllustration(dto.city, dto.country);

  // Server-rendered badges layered on top of the photo mosaic / hero.
  const mediaOverlay = (
    <>
      {matchScore !== null && (
        <span className="absolute top-4 left-4 match-badge text-sm py-1 px-3">{matchScore}% match</span>
      )}
      {dto.isFeatured && <FeaturedRibbon />}
    </>
  );

  // Mobile bottom-bar CTA mirrors the aside CTA (the aside stacks far below
  // the content on small screens).
  const cta = isOwner ? (
    <Link href={`/listings/${dto.id}/edit`} className="pill-ghost w-full justify-center">
      Edit your listing
    </Link>
  ) : !session ? (
    <Link href={`/login?next=/listings/${dto.id}`} className="pill-primary w-full justify-center">
      Sign in to propose a swap
    </Link>
  ) : !viewerListing ? (
    <Link href="/listings/new" className="pill-primary w-full justify-center">
      List your home first
    </Link>
  ) : (
    <ProposeSwapButton proposerListing={viewerListing} targetListing={dto} />
  );

  return (
    <div className="wrap py-10 lg:py-14 pb-28 lg:pb-14">
      {/* Feeds the "Recently viewed" shelf on /listings (DOK-150). The
          owner's own listing isn't tracked. */}
      {!isOwner && (
        <RecentlyViewedTracker
          entry={{
            id: dto.id,
            title: dto.title,
            city: dto.city,
            country: dto.country,
            neighbourhood: dto.neighbourhood,
            photo: dto.photos[0] ?? heroIllustration?.url ?? null,
          }}
        />
      )}

      {/* Title row — above the photos, actions on the right (DOK-150). */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="kicker mb-2">{dto.country}</p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
            {dto.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ShareListingButton title={dto.title} city={dto.city} />
          {!isOwner && <SaveListingButton listingId={dto.id} />}
        </div>
      </header>

      {/* Media block — photo mosaic when the listing has photos; otherwise
          the city illustration hero stays exactly where it was. */}
      {hasPhotos ? (
        <ListingPhotoMosaic photos={dto.photos} overlay={mediaOverlay} />
      ) : (
        <div>
          <div
            className="surface-card surface-card--static overflow-hidden aspect-[16/10] sm:aspect-[2/1] relative"
            style={{ background: "var(--cream-2)" }}
          >
            {heroIllustration ? (
              <HeroIllustration photo={heroIllustration} />
            ) : (
              /* Fallback hero: the city-postcard illustration, drawn in the
                 hand-drafted linear style. Real city photos live in the
                 Discover section below. */
              <CityIllust city={dto.city} palette={dto.palette} motif={dto.motif} postcard={dto.postcard} styleMode="linear" />
            )}
            {mediaOverlay}
          </div>
          {heroIllustration && (
            <p className="mt-2 text-[10px] font-mono truncate" style={{ color: "var(--navy-3)" }}>
              <Attribution photo={heroIllustration} />
            </p>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        {/* min-w-0: grid items default to min-width auto, so a wide child
            (photo grids, Discover cards) would overflow small viewports
            instead of shrinking the column. */}
        <div className="min-w-0">
          {/* Sub-facts row, Airbnb style. */}
          <div className="mb-6">
            <p className="text-[16px] font-medium inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <Pin color="var(--pink)" size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />
              <span>
                {dto.neighbourhood}, {dto.city} · {propertyLabel(dto.propertyType)} · {dto.sleeps} guests ·{" "}
                {dto.bedrooms} beds · {dto.bathrooms} baths
              </span>
              {dto.isVerified && <VerifiedBadge size={16} />}
            </p>
          </div>

          {/* "Loved by swappers" — guest-favourite-style card, only when the
              numbers back it up (match ≥ 75 or rating ≥ 4.5). */}
          {loved && (
            <div
              className="mb-8 flex items-center justify-between gap-4 rounded-2xl border px-5 py-4"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            >
              <div className="min-w-0">
                <div className="font-display text-lg tracking-[-0.01em] font-medium">Loved by swappers</div>
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                  One of the strongest candidates for your next home swap.
                </p>
              </div>
              <div className="flex items-center gap-5 shrink-0 text-center">
                {matchScore !== null && matchScore >= 75 && (
                  <div>
                    <div className="font-display text-2xl leading-none" style={{ color: "var(--pink)" }}>
                      {matchScore}%
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
                      match
                    </div>
                  </div>
                )}
                {avgRating !== null && avgRating >= 4.5 && (
                  <div>
                    <div className="font-display text-2xl leading-none">★ {avgRating}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
                      {reviewCount} review{reviewCount === 1 ? "" : "s"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <Section title="About this home">
            <p className="text-[16px] leading-[1.65] whitespace-pre-line">{dto.description}</p>
          </Section>

          <Section title="The space">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <Stat label="Property" value={propertyLabel(dto.propertyType)} />
              <Stat label="Size" value={`${dto.sizeSqm} m²`} />
              <Stat label="Sleeps" value={String(dto.sleeps)} />
              <Stat label="Bedrooms" value={String(dto.bedrooms)} />
              <Stat label="Bathrooms" value={String(dto.bathrooms)} />
              <Stat label="Floor" value={dto.floor !== null ? String(dto.floor) : "—"} />
            </dl>
          </Section>

          {chips.length > 0 && (
            <Section title="Amenities">
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <span key={c} className="tag-chip">{c}</span>
                ))}
              </div>
            </Section>
          )}

          {/* The city illustration demotes here when real photos hold the
              hero slot — it stays in the product as the Discover opener. */}
          {hasPhotos && heroIllustration && (
            <Section title={`Postcard from ${dto.city}`}>
              <div
                className="relative overflow-hidden rounded-2xl border aspect-[16/9]"
                style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
              >
                <HeroIllustration photo={heroIllustration} />
              </div>
              <p className="mt-1.5 text-[10px] font-mono truncate" style={{ color: "var(--navy-3)" }}>
                <Attribution photo={heroIllustration} />
              </p>
            </Section>
          )}

          <Suspense fallback={<DiscoverCitySkeleton city={dto.city} />}>
            <DiscoverCity city={dto.city} country={dto.country} />
          </Suspense>
        </div>

        <aside className="space-y-5">
          {/* Booking-style card (DOK-150): availability cells, stay length,
              primary CTA, insurance note — host context below. */}
          <div className="surface-card surface-card--static p-6 sticky top-24">
            <div
              className="grid grid-cols-2 rounded-xl border overflow-hidden mb-3"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="p-3">
                <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
                  From
                </div>
                <div className="text-sm font-medium">{fmtDate(dto.availableFrom)}</div>
              </div>
              <div className="p-3 border-l" style={{ borderColor: "var(--line)" }}>
                <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
                  To
                </div>
                <div className="text-sm font-medium">{fmtDate(dto.availableTo)}</div>
              </div>
            </div>
            <p className="font-mono text-[11px] mb-4" style={{ color: "var(--navy-3)" }}>
              Stays of {dto.minStayDays}–{dto.maxStayDays} days
            </p>

            {isOwner ? (
              <div className="text-sm rounded-xl p-4" style={{ background: "var(--cream-2)" }}>
                This is your own listing. <Link href={`/listings/${dto.id}/edit`} className="font-medium" style={{ color: "var(--pink)" }}>Edit it</Link>.
              </div>
            ) : (
              cta
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              <span>◦ €150k cover</span>
              <span>◦ Trip refund</span>
              <span>◦ 24/7 line</span>
            </div>

            <div className="mt-5 divider-dashed pt-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  Hosted by
                </span>
                {matchScore !== null && <span className="match-badge">{matchScore}% match</span>}
              </div>
              <Link href={`/profile/${listing.user?.id ?? ""}`} className="font-display text-xl mb-1 block hover:underline">
                {listing.user?.name ?? "swapl host"}
              </Link>
              {avgRating !== null && (
                <p className="font-mono text-[11px] mb-2" style={{ color: "var(--navy-3)" }}>
                  ★ {avgRating} · {reviewCount} review{reviewCount === 1 ? "" : "s"}
                </p>
              )}
              {listing.user?.bio && (
                <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
                  {listing.user.bio}
                </p>
              )}
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                <SwapArrows color="currentColor" size={14} />
                Trade your home for theirs
              </div>
              <p className="text-sm mt-2" style={{ color: "var(--navy-2)" }}>
                Send a swap proposal with your own listing attached. They accept, decline, or counter — never any money.
              </p>
            </div>
          </div>

          {/* Stay with Keys (DOK-155) — non-simultaneous booking mode that
              sits ALONGSIDE the direct swap above. Signed-in non-owners only;
              the host can't book their own home. */}
          {viewer && (
            <div className="surface-card surface-card--static p-6">
              <I18nProviderShell>
                <StayWithKeys listingId={dto.id} balance={viewer.keysBalance} />
              </I18nProviderShell>
            </div>
          )}

          <div className="surface-card p-6 text-sm" style={{ background: "var(--pink-light)" }}>
            <div className="font-display text-lg mb-1.5">Why this could be a great match</div>
            <p style={{ color: "var(--navy-2)" }}>
              {viewerListing
                ? `You're offering ${viewerListing.sizeSqm}m² in ${viewerListing.city}. Their place is ${dto.sizeSqm}m² — within the typical ±50% comfort zone.`
                : `List your home to unlock match scores and propose a direct swap.`}
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile sticky bottom bar — mirrors the aside CTA, which on small
          screens sits below the whole content column. */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t px-4 py-3 flex items-center gap-4"
        style={{ background: "var(--cream)", borderColor: "var(--line)" }}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{formatDateRange(dto.availableFrom, dto.availableTo)}</div>
          <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {dto.minStayDays}–{dto.maxStayDays} day stays
          </div>
        </div>
        <div className="ml-auto shrink-0 w-[55%] max-w-[260px]">{cta}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 pt-6 divider-dashed first:border-t-0 first:pt-0">
      <h2 className="font-display text-xl tracking-[-0.01em] font-medium mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
