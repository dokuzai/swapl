// "Discover {city}" — real city photos + affiliate booking cards on the
// listing detail page. Server component; meant to be rendered inside
// <Suspense> because getCityMedia may hit a slow upstream (4s cap).
//
// All outbound links route through /api/affiliate/[partnerSlug] so every
// click is logged as an AffiliateClick row before the 302. Query params
// mirror exactly what that route reads: city, country, q, utm_campaign.
//
// No hotels card: the seeded partners are skyscanner / airalo / getyourguide
// / battleface only — we never invent partner secrets.

import { getCityMedia, type CityPhoto } from "@/lib/city-media";

const CAMPAIGN = "discover_city";

function affiliateHref(
  partner: "skyscanner" | "airalo" | "getyourguide",
  params: Record<string, string | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  qs.set("utm_campaign", CAMPAIGN);
  return `/api/affiliate/${partner}?${qs.toString()}`;
}

function Attribution({ photo }: { photo: CityPhoto }) {
  if (photo.provider === "pexels" && photo.photographer) {
    // Pexels requires a visible photographer + Pexels credit.
    return (
      <span>
        Photo:{" "}
        {photo.photographerUrl ? (
          <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {photo.photographer}
          </a>
        ) : (
          photo.photographer
        )}{" "}
        /{" "}
        <a href={photo.sourceUrl ?? "https://www.pexels.com"} target="_blank" rel="noopener noreferrer" className="underline">
          Pexels
        </a>
      </span>
    );
  }
  if (photo.provider === "unsplash" && photo.photographer) {
    return (
      <span>
        Photo:{" "}
        {photo.photographerUrl ? (
          <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {photo.photographer}
          </a>
        ) : (
          photo.photographer
        )}{" "}
        / Unsplash
      </span>
    );
  }
  // Wikimedia: link the file page.
  return (
    <span>
      {photo.photographer ? `Photo: ${photo.photographer} / ` : "Photo: "}
      <a href={photo.sourceUrl ?? "https://commons.wikimedia.org"} target="_blank" rel="noopener noreferrer" className="underline">
        Wikimedia
      </a>
    </span>
  );
}

function BookCard({
  href,
  kicker,
  title,
  body,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener sponsored" className="surface-card p-5 block hover:no-underline group">
      <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--pink)" }}>
        {kicker}
      </div>
      <div className="font-display text-lg tracking-[-0.01em] font-medium mb-1 group-hover:underline">{title}</div>
      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        {body}
      </p>
    </a>
  );
}

export async function DiscoverCity({ city, country }: { city: string; country: string }) {
  const photos = (await getCityMedia(city, country)).slice(0, 6);

  return (
    <section className="mb-8 pt-6 divider-dashed">
      <h2 className="font-display text-xl tracking-[-0.01em] font-medium mb-4">Discover {city}</h2>

      {photos.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <figure key={photo.url} className="m-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.alt}
                  className="aspect-[4/3] w-full object-cover rounded-2xl border"
                  style={{ borderColor: "var(--line)" }}
                  loading={i < 3 ? "eager" : "lazy"}
                />
                <figcaption className="mt-1 text-[10px] font-mono truncate" style={{ color: "var(--navy-3)" }}>
                  <Attribution photo={photo} />
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
        Book your trip
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BookCard
          href={affiliateHref("getyourguide", { city, country, q: city })}
          kicker="Experiences"
          title={`Things to do in ${city}`}
          body="Museums, tours and experiences, hand-picked by GetYourGuide."
        />
        <BookCard
          href={affiliateHref("skyscanner", { city, country })}
          kicker="Flights"
          title={`Fly to ${city}`}
          body="Compare flights from anywhere on Skyscanner."
        />
        <BookCard
          href={affiliateHref("airalo", { city, country })}
          kicker="eSIM"
          title="Stay connected"
          body={`Data the moment you land in ${country}, via Airalo.`}
        />
      </div>
      <p className="mt-3 text-[10px] font-mono" style={{ color: "var(--navy-3)" }}>
        swapl may earn a commission on bookings made through these partner links.
      </p>
    </section>
  );
}

/** Lightweight skeleton shown while the media fetch resolves. */
export function DiscoverCitySkeleton({ city }: { city: string }) {
  return (
    <section className="mb-8 pt-6 divider-dashed" aria-busy="true">
      <h2 className="font-display text-xl tracking-[-0.01em] font-medium mb-4">Discover {city}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] rounded-2xl border animate-pulse"
            style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border animate-pulse"
            style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
          />
        ))}
      </div>
    </section>
  );
}
