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
import { propertyTypeKey } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { getViewerListing } from "@/lib/listing-query";
import { computeMatchScore } from "@/lib/match/score";
import ProposeSwapButton from "./propose-swap-button";
import { StayWithKeys } from "./stay-with-keys";
import { ValuationExplainer } from "./valuation-explainer";
import { VerifiedBadge, FeaturedRibbon, OwnerVerifiedBadge } from "@/components/listing/badges";
import { RecentlyViewedTracker } from "@/components/listing/recently-viewed-tracker";
import { ListingLocationMap } from "@/components/map/listing-location-map";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getDictionary, getI18n, t } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const l = await prisma.listing.findUnique({
    where: { id },
    include: { user: { select: { settings: true } } },
  });
  if (!l) {
    const dict = await getDictionary();
    return { title: `${t(dict, "listingDetail.notFoundTitle")} · swapl` };
  }
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

function fmtDate(iso: string, locale: string = "en-US"): string {
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export default async function ListingDetailPage(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, bio: true, avatar: true } } },
  });
  if (!listing || !listing.isActive) notFound();

  const session = await getSession();
  const viewerListing = await getViewerListing(session?.userId);
  const isOwner = session?.userId === listing.userId;
  // Owner sees the structured valuation breakdown (DOK-163); other members
  // never get it, so include the explanation only for the owner.
  const dto = toDTO(listing, { includeValuation: isOwner });

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
  const { locale, dict } = await getI18n();

  // Real CC-licensed illustration of the city (Openverse, cached 30 days in
  // CityMedia kind="illustration"; a cache miss fetches within the provider's
  // 4s timeout). With photos it demotes to the Discover section below; with
  // none found AND no photos → the linear SVG postcard hero, exactly as before.
  const heroIllustration = await getCityIllustration(dto.city, dto.country);

  // Server-rendered badges layered on top of the photo mosaic / hero.
  const mediaOverlay = (
    <>
      {matchScore !== null && (
        <span className="absolute top-4 left-4 match-badge text-sm py-1 px-3">{t(dict, "listing.matchBadge", { score: matchScore })}</span>
      )}
      {dto.isFeatured && <FeaturedRibbon label={t(dict, "listing.featuredRibbon")} />}
    </>
  );

  // Mobile bottom-bar CTA mirrors the aside CTA (the aside stacks far below
  // the content on small screens).
  const cta = isOwner ? (
    <Link href={`/listings/${dto.id}/edit`} className="pill-ghost w-full justify-center">
      {t(dict, "listingDetail.ctaEdit")}
    </Link>
  ) : !session ? (
    <Link href={`/login?next=/listings/${dto.id}`} className="pill-primary w-full justify-center">
      {t(dict, "listing.signInToPropose")}
    </Link>
  ) : !viewerListing ? (
    <Link href="/listings/new" className="pill-primary w-full justify-center">
      {t(dict, "listing.listFirst")}
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
          {dto.spaceType === "private_room" && (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2">
              <span
                className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: "var(--navy)", color: "#fff" }}
              >
                {dto.roomsOffered && dto.roomsOffered > 1
                  ? t(dict, "listing.spaceType.privateRoomBadgeCount", { count: dto.roomsOffered })
                  : t(dict, "listing.spaceType.privateRoomBadge")}
              </span>
              <span className="text-[12px]" style={{ color: "var(--navy-3)" }}>
                {t(dict, "listing.spaceType.fewerKeysNote")}
              </span>
            </div>
          )}
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
                {dto.neighbourhood}, {dto.city} · {t(dict, propertyTypeKey(dto.propertyType))} · {t(dict, "listingDetail.guests", { count: dto.sleeps })} ·{" "}
                {t(dict, "listingDetail.beds", { count: dto.bedrooms })} · {t(dict, "listingDetail.baths", { count: dto.bathrooms })}
              </span>
              {dto.isVerified && <VerifiedBadge size={16} label={t(dict, "listing.verifiedBadge")} />}
            </p>
            {dto.ownerVerified && (
              <div className="mt-2">
                <OwnerVerifiedBadge
                  label={t(dict, "ownerVerified.badge")}
                  title={t(dict, "ownerVerified.tooltip")}
                />
              </div>
            )}
          </div>

          {/* "Loved by swappers" — guest-favourite-style card, only when the
              numbers back it up (match ≥ 75 or rating ≥ 4.5). */}
          {loved && (
            <div
              className="mb-8 flex items-center justify-between gap-4 rounded-2xl border px-5 py-4"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            >
              <div className="min-w-0">
                <div className="font-display text-lg tracking-[-0.01em] font-medium">{t(dict, "listingDetail.lovedTitle")}</div>
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                  {t(dict, "listingDetail.lovedBody")}
                </p>
              </div>
              <div className="flex items-center gap-5 shrink-0 text-center">
                {matchScore !== null && matchScore >= 75 && (
                  <div>
                    <div className="font-display text-2xl leading-none" style={{ color: "var(--pink)" }}>
                      {matchScore}%
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
                      {t(dict, "listingDetail.matchLabel")}
                    </div>
                  </div>
                )}
                {avgRating !== null && avgRating >= 4.5 && (
                  <div>
                    <div className="font-display text-2xl leading-none">★ {avgRating}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
                      {t(dict, reviewCount === 1 ? "listingDetail.reviewCount.one" : "listingDetail.reviewCount.other", { count: reviewCount })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <Section title={t(dict, "listing.about")}>
            <p className="text-[16px] leading-[1.65] whitespace-pre-line">{dto.description}</p>
          </Section>

          <Section title={t(dict, "listing.theSpace")}>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <Stat label={t(dict, "listingDetail.statProperty")} value={t(dict, propertyTypeKey(dto.propertyType))} />
              <Stat label={t(dict, "listingDetail.statSize")} value={`${dto.sizeSqm} m²`} />
              <Stat label={t(dict, "listingDetail.statSleeps")} value={String(dto.sleeps)} />
              <Stat label={t(dict, "listingDetail.statBedrooms")} value={String(dto.bedrooms)} />
              <Stat label={t(dict, "listingDetail.statBathrooms")} value={String(dto.bathrooms)} />
              <Stat label={t(dict, "listingDetail.statFloor")} value={dto.floor !== null ? String(dto.floor) : "—"} />
            </dl>
          </Section>

          {chips.length > 0 && (
            <Section title={t(dict, "listing.amenities")}>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <span key={c.key} className="tag-chip">{t(dict, c.key, c.vars)}</span>
                ))}
              </div>
            </Section>
          )}

          {dto.lat != null && dto.lng != null && (
            <Section title={t(dict, "listing.map.title")}>
              <ListingLocationMap
                lat={dto.lat}
                lng={dto.lng}
                neighbourhood={dto.neighbourhood}
                city={dto.city}
              />
            </Section>
          )}

          {/* The city illustration demotes here when real photos hold the
              hero slot — it stays in the product as the Discover opener. */}
          {hasPhotos && heroIllustration && (
            <Section title={t(dict, "listingDetail.postcardFrom", { city: dto.city })}>
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
              primary CTA, insurance note — host context below. Sticky only on
              desktop: on mobile the aside is a full-width stacked column, where
              a sticky card pins on scroll and overlaps the Stay-with-Keys card
              (calendar) below it. */}
          <div className="surface-card surface-card--static p-6 lg:sticky lg:top-24">
            <div
              className="grid grid-cols-2 rounded-xl border overflow-hidden mb-3"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="p-3">
                <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
                  {t(dict, "listingDetail.from")}
                </div>
                <div className="text-sm font-medium">{fmtDate(dto.availableFrom, locale)}</div>
              </div>
              <div className="p-3 border-l" style={{ borderColor: "var(--line)" }}>
                <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
                  {t(dict, "listingDetail.to")}
                </div>
                <div className="text-sm font-medium">{fmtDate(dto.availableTo, locale)}</div>
              </div>
            </div>
            <p className="font-mono text-[11px] mb-4" style={{ color: "var(--navy-3)" }}>
              {t(dict, "listingDetail.staysOf", { min: dto.minStayDays, max: dto.maxStayDays })}
            </p>

            {isOwner ? (
              <div className="text-sm rounded-xl p-4" style={{ background: "var(--cream-2)" }}>
                {t(dict, "listingDetail.ownListing")} <Link href={`/listings/${dto.id}/edit`} className="font-medium" style={{ color: "var(--pink)" }}>{t(dict, "listing.editYours")}</Link>.
              </div>
            ) : (
              cta
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              <span>◦ {t(dict, "listingDetail.coverAmount")}</span>
              <span>◦ {t(dict, "listingDetail.tripRefund")}</span>
              <span>◦ {t(dict, "listingDetail.support247")}</span>
            </div>

            <div className="mt-5 divider-dashed pt-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  {t(dict, "listing.hostedBy")}
                </span>
                {matchScore !== null && <span className="match-badge">{t(dict, "listing.matchBadge", { score: matchScore })}</span>}
              </div>
              <Link href={`/profile/${listing.user?.id ?? ""}`} className="font-display text-xl mb-1 block hover:underline">
                {listing.user?.name ?? t(dict, "listingDetail.hostFallback")}
              </Link>
              {dto.ownerVerified && (
                <div className="mb-2">
                  <OwnerVerifiedBadge
                    label={t(dict, "ownerVerified.badge")}
                    title={t(dict, "ownerVerified.tooltip")}
                  />
                </div>
              )}
              {avgRating !== null && (
                <p className="font-mono text-[11px] mb-2" style={{ color: "var(--navy-3)" }}>
                  ★ {avgRating} · {t(dict, reviewCount === 1 ? "listingDetail.reviewCount.one" : "listingDetail.reviewCount.other", { count: reviewCount })}
                </p>
              )}
              {listing.user?.bio && (
                <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
                  {listing.user.bio}
                </p>
              )}
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                <SwapArrows color="currentColor" size={14} />
                {t(dict, "listingDetail.tradeYourHome")}
              </div>
              <p className="text-sm mt-2" style={{ color: "var(--navy-2)" }}>
                {t(dict, "listing.tradeBlurb")}
              </p>
            </div>
          </div>

          {/* Owner-only valuation breakdown (DOK-163) — "how your nightly Keys
              are calculated". The DTO carries the structured explanation only
              for the owner, so non-owners never see this. */}
          {isOwner && dto.valuationExplanation && (
            <I18nProviderShell>
              <ValuationExplainer
                nightlyKeys={dto.nightlyKeys}
                explanation={dto.valuationExplanation}
              />
            </I18nProviderShell>
          )}

          {/* Stay with Keys (DOK-155) — non-simultaneous booking mode that
              sits ALONGSIDE the direct swap above. Signed-in non-owners only;
              the host can't book their own home. */}
          {viewer && (
            <div id="stay-with-keys" className="surface-card surface-card--static p-6 scroll-mt-24">
              <I18nProviderShell>
                <StayWithKeys listingId={dto.id} balance={viewer.keysBalance} />
              </I18nProviderShell>
            </div>
          )}

          <div className="surface-card p-6 text-sm" style={{ background: "var(--pink-light)" }}>
            <div className="font-display text-lg mb-1.5">{t(dict, "listing.match.title")}</div>
            <p style={{ color: "var(--navy-2)" }}>
              {viewerListing
                ? t(dict, "listingDetail.whyMatchBody", { yourSize: viewerListing.sizeSqm, yourCity: viewerListing.city, theirSize: dto.sizeSqm })
                : t(dict, "listingDetail.whyMatchLocked")}
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
          <div className="text-sm font-medium truncate">{formatDateRange(dto.availableFrom, dto.availableTo, locale)}</div>
          <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t(dict, "listingDetail.dayStays", { min: dto.minStayDays, max: dto.maxStayDays })}
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
