// Concierge "Make it seamless" surface that appears on /swaps/[id] after
// acceptance. Mixes flat-fee add-ons (cleaning, lockbox, city guide) and
// affiliate links (transfer, eSIM). Affiliate items use the existing
// AffiliateLink so click attribution still flows server-side.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AffiliateLink } from "@/components/affiliate/affiliate-link";

export type AddOn = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  type: "flat_fee" | "affiliate" | "included_in_plan";
  category: string;
};

export function ConciergeSection({
  agreementId,
  destinationCity,
  destinationCountry,
  addOns,
  alreadyPurchasedSlugs,
  cityGuideIncluded,
}: {
  agreementId: string;
  destinationCity: string;
  destinationCountry: string;
  addOns: AddOn[];
  alreadyPurchasedSlugs: string[];
  cityGuideIncluded: boolean;
}) {
  const router = useRouter();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function buy(slug: string) {
    setError(null);
    setPendingSlug(slug);
    start(async () => {
      const res = await fetch("/api/concierge/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, slug }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.ok) {
        router.refresh();
      } else {
        setError(j.error ?? "Couldn't process");
      }
      setPendingSlug(null);
    });
  }

  const purchased = new Set(alreadyPurchasedSlugs);

  return (
    <section className="mt-10">
      <p className="kicker mb-3">Make it seamless</p>
      <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">Optional add-ons for your stay</h2>
      {error && <p className="text-sm mb-3" style={{ color: "#dc2626" }}>{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {addOns.map((a) => {
          const own = purchased.has(a.slug);
          const includedForUser = a.slug === "city-guide" && cityGuideIncluded;
          if (a.type === "affiliate") {
            const partner = a.slug === "transfer" ? "getyourguide" : "airalo";
            return (
              <AffiliateLink
                key={a.slug}
                partner={partner}
                city={destinationCity}
                country={destinationCountry}
                agreementId={agreementId}
                campaign={`concierge_${a.slug}`}
                variant="card"
              >
                <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                  {a.category} · partner
                </div>
                <div className="font-display text-lg tracking-[-0.01em]">{a.name}</div>
                <p className="text-sm mt-1" style={{ color: "var(--navy-2)" }}>{a.description}</p>
                <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
                  Open partner →
                </span>
              </AffiliateLink>
            );
          }
          return (
            <article key={a.slug} className="surface-card p-5 flex flex-col">
              <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                {a.category}
              </div>
              <div className="font-display text-lg tracking-[-0.01em]">{a.name}</div>
              <p className="text-sm mt-1 flex-1" style={{ color: "var(--navy-2)" }}>{a.description}</p>
              {includedForUser ? (
                // Bundled with the member's plan — no charge, so the price is
                // hidden (showing €9 next to "Included" misled). Full-width row
                // badge, never the squeezed circle a justify-between caused.
                <div className="mt-3">
                  <span className="block w-full text-center font-mono text-[10px] uppercase tracking-[.08em] leading-snug px-2.5 py-1.5 rounded-lg"
                    style={{ background: "var(--pink-light)", color: "var(--pink)" }}>
                    ✓ Included with your plan
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-display text-lg leading-none">€{(a.priceCents / 100).toFixed(2)}</span>
                  {own ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.06em] h-9 px-3.5 rounded-full whitespace-nowrap shrink-0"
                      style={{ background: "var(--pink-light)", color: "var(--pink)" }}>
                      ✓ Booked
                    </span>
                  ) : (
                    <button
                      onClick={() => buy(a.slug)}
                      className="inline-flex items-center justify-center font-medium text-[13px] h-9 px-5 rounded-full whitespace-nowrap shrink-0 transition disabled:opacity-60"
                      style={{ background: "var(--pink)", color: "#fff" }}
                      disabled={pendingSlug !== null}
                    >
                      {pendingSlug === a.slug ? "Processing…" : "Add"}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--navy-3)" }}>
        Disclosure: flat-fee add-ons are billed by swapl; affiliate items earn us a small referral.
        Either way, your swap acceptance is never gated by a paid add-on.
      </p>
    </section>
  );
}
