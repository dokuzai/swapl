import Link from "next/link";
import { CityIllust, Pin } from "@/components/illustrations";
import { type ListingDTO, formatDateRange, amenityChips } from "@/lib/listing-utils";
import { propertyLabel } from "@/lib/types";

export function ListingCard({
  listing,
  matchScore,
  hrefSuffix,
}: {
  listing: ListingDTO;
  matchScore?: number | null;
  hrefSuffix?: string;
}) {
  const chips = amenityChips(listing).slice(0, 3);
  return (
    <Link
      href={`/listings/${listing.id}${hrefSuffix ?? ""}`}
      className="surface-card overflow-hidden block group"
      aria-label={`${listing.title} in ${listing.city}`}
    >
      <div className="aspect-[16/10] relative overflow-hidden" style={{ background: "var(--cream-2)" }}>
        <CityIllust
          city={listing.city}
          palette={listing.palette}
          motif={listing.motif}
          postcard={listing.postcard}
        />
        {typeof matchScore === "number" && (
          <span className="absolute top-3 left-3 match-badge">{matchScore}% match</span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-display text-lg tracking-[-0.01em] font-medium leading-tight">
            {listing.neighbourhood} · {listing.city}
          </div>
          <div className="text-xs whitespace-nowrap" style={{ color: "var(--navy-3)" }}>
            <Pin color="var(--pink)" size={10} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
            {listing.country}
          </div>
        </div>
        <div className="mt-1 text-[13px]" style={{ color: "var(--navy-3)" }}>
          {propertyLabel(listing.propertyType)} · {listing.sizeSqm}m² · sleeps {listing.sleeps}
        </div>
        <div className="mt-3 text-[12px] font-mono" style={{ color: "var(--navy-3)" }}>
          {formatDateRange(listing.availableFrom, listing.availableTo)}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 pt-3 divider-dashed">
            {chips.map((c) => (
              <span key={c} className="tag-chip">{c}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
