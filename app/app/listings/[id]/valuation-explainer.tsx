"use client";

// ValuationExplainer (DOK-219) — the owner-only "How your nightly Keys are
// calculated" card on a listing the member owns. The value is now simply the
// home's guest capacity (one Key per night per person it sleeps), so this is a
// single honest line, not a multi-factor breakdown. Pure presentation — the
// value is the persisted nightlyKeys from the DTO.

import { useT } from "@/lib/i18n/client";
import type { ValuationExplanation } from "@/lib/keys/valuation";

export function ValuationExplainer({
  nightlyKeys,
  explanation,
}: {
  nightlyKeys: number | null;
  explanation: ValuationExplanation;
}) {
  const t = useT();
  const value = nightlyKeys ?? explanation.nightlyKeys;

  return (
    <section className="surface-card surface-card--static p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
            {t("keys.explain.kicker")}
          </div>
          <h2 className="font-display text-xl tracking-[-0.01em] font-medium">{t("keys.explain.title")}</h2>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl leading-none" style={{ color: "var(--pink)" }}>
            {value}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
            {t("keys.explain.perNight")}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-[1.6]" style={{ color: "var(--navy-2)" }}>
        {t("keys.explain.intro")}
      </p>
    </section>
  );
}
