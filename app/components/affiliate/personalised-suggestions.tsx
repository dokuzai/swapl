"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

type Suggestion = {
  partner: "skyscanner" | "airalo" | "getyourguide" | "battleface";
  title: string;
  reason: string;
  searchQuery?: string;
};

type Bundle = { items: Suggestion[]; source: "ai" | "fallback" };

const PARTNER_LABEL: Record<Suggestion["partner"], string> = {
  skyscanner: "Skyscanner",
  airalo: "Airalo",
  getyourguide: "GetYourGuide",
  battleface: "Battleface",
};

export function PersonalisedSuggestions({
  agreementId,
  destinationCity,
  destinationCountry,
}: {
  agreementId: string;
  destinationCity: string;
  destinationCountry: string;
}) {
  const t = useT();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/affiliate-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agreementId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed");
        return r.json();
      })
      .then((b) => alive && setBundle(b))
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [agreementId]);

  if (error) {
    return (
      <section className="mt-10">
        <p className="kicker mb-3">{t("affiliate.kicker")}</p>
        <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
          {t("affiliate.unavailable", { error })}
        </div>
      </section>
    );
  }

  if (!bundle) {
    return (
      <section className="mt-10">
        <p className="kicker mb-3">{t("affiliate.kicker")}</p>
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">{t("affiliate.matching", { city: destinationCity })}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card overflow-hidden">
              <div className="p-5 space-y-2">
                <div className="skeleton h-3 w-1/3" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (bundle.items.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="kicker">{t("affiliate.kicker")}</p>
          <h2 className="font-display text-2xl tracking-[-0.01em]">{t("affiliate.matched", { city: destinationCity })}</h2>
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
          style={{
            background: bundle.source === "ai" ? "var(--pink-light)" : "var(--cream-2)",
            color: bundle.source === "ai" ? "var(--pink)" : "var(--navy-3)",
          }}
        >
          {bundle.source === "ai" ? t("affiliate.badgeAi") : t("affiliate.badgeInterest")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bundle.items.map((s, i) => {
          const params = new URLSearchParams({ city: destinationCity, country: destinationCountry, agreement: agreementId, utm_campaign: `personalised_${s.partner}` });
          if (s.searchQuery) params.set("q", s.searchQuery);
          return (
            <a
              key={i}
              href={`/api/affiliate/${s.partner}?${params.toString()}`}
              target="_blank"
              rel="noopener sponsored"
              className="surface-card p-5 block hover:no-underline"
            >
              <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
                {t("affiliate.sponsoredTag", { partner: PARTNER_LABEL[s.partner] })}
              </div>
              <div className="font-display text-lg tracking-[-0.01em]">{s.title}</div>
              <p className="text-sm mt-1" style={{ color: "var(--navy-2)" }}>{s.reason}</p>
            </a>
          );
        })}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--navy-3)" }}>
        {t("affiliate.disclosure")}{" "}
        <Link href="/account/interests" className="underline" style={{ color: "var(--pink)" }}>
          {t("affiliate.refineInterests")}
        </Link>{" "}
        {t("affiliate.toSharpen")}
      </p>
    </section>
  );
}
