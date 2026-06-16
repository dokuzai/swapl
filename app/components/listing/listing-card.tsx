import Link from "next/link";
import { CityIllust, Pin } from "@/components/illustrations";
import { type ListingDTO, formatDateRange, amenityChips } from "@/lib/listing-utils";
import type { CityPhoto } from "@/lib/city-media/types";
import { propertyTypeKey } from "@/lib/types";
import { getI18n, t } from "@/lib/i18n/server";
import { VerifiedBadge, FeaturedRibbon } from "@/components/listing/badges";

export async function ListingCard({
  listing,
  matchScore,
  hrefSuffix,
  cityPhoto,
}: {
  listing: ListingDTO;
  matchScore?: number | null;
  hrefSuffix?: string;
  /** Cached real city photo — used when the listing has no photos of its own. */
  cityPhoto?: CityPhoto | null;
}) {
  const { locale, dict } = await getI18n();
  const chips = amenityChips(listing).slice(0, 3);
  // Cover priority: the listing's own first photo → a real city photo →
  // today's postcard illustration.
  const coverUrl = listing.photos[0] ?? cityPhoto?.url ?? null;
  const coverAlt = listing.photos[0] ? `${listing.title} in ${listing.city}` : cityPhoto?.alt ?? "";
  return (
    <Link
      href={`/listings/${listing.id}${hrefSuffix ?? ""}`}
      className="surface-card overflow-hidden block group"
      aria-label={`${listing.title} in ${listing.city}`}
    >
      <div className="aspect-[16/10] relative overflow-hidden" style={{ background: "var(--cream-2)" }}>
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt={coverAlt}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <CityIllust
            city={listing.city}
            palette={listing.palette}
            motif={listing.motif}
            postcard={listing.postcard}
          />
        )}
        {typeof matchScore === "number" && (
          <span className="absolute top-3 left-3 match-badge">{t(dict, "listing.matchBadge", { score: matchScore })}</span>
        )}
        {listing.isFeatured && <FeaturedRibbon label={t(dict, "listing.featuredRibbon")} />}
        {listing.spaceType === "private_room" && (
          <span
            className="absolute bottom-3 left-3 text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{ background: "var(--navy)", color: "#fff" }}
          >
            {t(dict, "listing.spaceType.privateRoomChip")}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-display text-lg tracking-[-0.01em] font-medium leading-tight inline-flex items-center gap-2">
            <span>{listing.neighbourhood} · {listing.city}</span>
            {listing.isVerified && <VerifiedBadge size={18} label={t(dict, "listing.verifiedBadge")} />}
          </div>
          <div className="text-xs whitespace-nowrap" style={{ color: "var(--navy-3)" }}>
            <Pin color="var(--pink)" size={10} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
            {listing.country}
          </div>
        </div>
        <div className="mt-1 text-[13px]" style={{ color: "var(--navy-3)" }}>
          {t(dict, propertyTypeKey(listing.propertyType))} · {t(dict, "listing.sizeSleeps", { size: listing.sizeSqm, sleeps: listing.sleeps })}
        </div>
        <div className="mt-3 text-[12px] font-mono" style={{ color: "var(--navy-3)" }}>
          {formatDateRange(listing.availableFrom, listing.availableTo, locale)}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 pt-3 divider-dashed">
            {chips.map((c) => (
              <span key={c.key} className="tag-chip">{t(dict, c.key, c.vars)}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
