import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toDTO, formatDateRange, amenityChips } from "@/lib/listing-utils";
import { CityIllust, SwapArrows, Pin } from "@/components/illustrations";
import { propertyLabel } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { getViewerListing } from "@/lib/listing-query";
import { computeMatchScore } from "@/lib/match/score";
import ProposeSwapButton from "./propose-swap-button";
import { VerifiedBadge, FeaturedRibbon } from "@/components/listing/badges";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const l = await prisma.listing.findUnique({ where: { id } });
  if (!l) return { title: "Listing not found · swapl" };
  return {
    title: `${l.neighbourhood} · ${l.city} — ${l.title} · swapl`,
    description: l.description.slice(0, 160),
    openGraph: {
      title: `${l.title} · ${l.city}`,
      description: l.description.slice(0, 160),
    },
  };
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

  const chips = amenityChips(dto);

  return (
    <div className="wrap py-10 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div
            className="surface-card overflow-hidden mb-8 aspect-[16/10] relative"
            style={{ background: "var(--cream-2)" }}
          >
            <CityIllust city={dto.city} palette={dto.palette} motif={dto.motif} postcard={dto.postcard} />
            {matchScore !== null && (
              <span className="absolute top-4 left-4 match-badge text-sm py-1 px-3">{matchScore}% match</span>
            )}
            {dto.isFeatured && <FeaturedRibbon />}
          </div>

          {dto.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-8">
              {dto.photos.slice(0, 4).map((url) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="aspect-[4/3] object-cover rounded-xl border"
                  style={{ borderColor: "var(--line)" }}
                  loading="lazy"
                />
              ))}
            </div>
          )}

          <header className="mb-6">
            <p className="kicker mb-3 inline-flex items-center gap-2">
              <span>{dto.country}</span>
              {dto.isVerified && <VerifiedBadge size={16} />}
            </p>
            <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
              {dto.title}
            </h1>
            <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
              <Pin color="var(--pink)" size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
              {dto.neighbourhood} · {dto.city}
            </p>
          </header>

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

          <Section title="Available">
            <p className="font-mono text-sm" style={{ color: "var(--navy-2)" }}>
              {formatDateRange(dto.availableFrom, dto.availableTo)} · stays from {dto.minStayDays}–{dto.maxStayDays} days
            </p>
          </Section>
        </div>

        <aside className="space-y-5">
          <div className="surface-card p-6 sticky top-24">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                Hosted by
              </span>
              {matchScore !== null && (
                <span className="match-badge">{matchScore}% match</span>
              )}
            </div>
            <Link href={`/profile/${listing.user?.id ?? ""}`} className="font-display text-xl mb-1 block hover:underline">
              {listing.user?.name ?? "swapl host"}
            </Link>
            {listing.user?.bio && (
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
                {listing.user.bio}
              </p>
            )}

            <div className="my-5 divider-dashed pt-4">
              <div className="flex items-center gap-2 mb-3 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                <SwapArrows color="currentColor" size={14} />
                Trade your home for theirs
              </div>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
                Send a swap proposal with your own listing attached. They accept, decline, or counter — never any money.
              </p>

              {isOwner ? (
                <div className="text-sm rounded-xl p-4" style={{ background: "var(--cream-2)" }}>
                  This is your own listing. <Link href={`/listings/${dto.id}/edit`} className="font-medium" style={{ color: "var(--pink)" }}>Edit it</Link>.
                </div>
              ) : !session ? (
                <Link href={`/login?next=/listings/${dto.id}`} className="pill-primary w-full justify-center">
                  Sign in to propose a swap
                </Link>
              ) : !viewerListing ? (
                <Link href="/listings/new" className="pill-primary w-full justify-center">
                  List your home first
                </Link>
              ) : (
                <ProposeSwapButton
                  proposerListing={viewerListing}
                  targetListing={dto}
                />
              )}

              <div className="mt-5 grid grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                <span>◦ €150k cover</span>
                <span>◦ Trip refund</span>
                <span>◦ 24/7 line</span>
              </div>
            </div>
          </div>

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
