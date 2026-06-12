"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import type { ListingDTO } from "@/lib/listing-utils";

type Item = { listing: ListingDTO; matchScore: number; reason: string; source: "ai" | "fallback" };

export function AISuggestions() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/suggestions")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed");
        return r.json();
      })
      .then((j) => !cancelled && setItems(j.items))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
        Suggestions unavailable: {error}
      </div>
    );

  if (!items) return <SkeletonRow />;

  if (items.length === 0)
    return (
      <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
        Publish a listing first — your suggestions adapt to your home.
      </div>
    );

  const source = items[0]?.source;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="kicker">Picked for you</p>
          <h2 className="font-display text-2xl tracking-[-0.01em]">Homes you&rsquo;d love</h2>
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
          style={{
            background: source === "ai" ? "var(--pink-light)" : "var(--cream-2)",
            color: source === "ai" ? "var(--pink)" : "var(--navy-3)",
          }}
        >
          {source === "ai" ? "AI · personalised" : "Match-score picks"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {items.map((it) => (
          <Link key={it.listing.id} href={`/listings/${it.listing.id}`} className="surface-card overflow-hidden block">
            <div className="aspect-[16/10] relative" style={{ background: "var(--cream-2)" }}>
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
              <span className="absolute top-3 left-3 match-badge">{it.matchScore}% match</span>
            </div>
            <div className="p-5">
              <div className="font-display text-base tracking-[-0.01em]">
                {it.listing.neighbourhood} · {it.listing.city}
              </div>
              <p className="mt-2 text-sm leading-snug" style={{ color: "var(--navy-2)" }}>
                {it.reason}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div>
      <div className="mb-4">
        <p className="kicker">Picked for you</p>
        <h2 className="font-display text-2xl tracking-[-0.01em]">Homes you&rsquo;d love</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface-card overflow-hidden">
            <div className="aspect-[16/10] skeleton" />
            <div className="p-5 space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
