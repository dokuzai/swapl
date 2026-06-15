"use client";

// ValuationExplainer (DOK-163) — the owner-only "How your nightly Keys are
// calculated" sheet on a listing the member owns. It reads the structured,
// persisted valuationExplanation (version 2) and renders it as a reassuring,
// itemised breakdown so the host understands WHY their per-night value is what
// it is and trusts that it's fair.
//
// Design goals:
//   - Transparency: every factor that builds the base is listed, in Keys.
//   - Reassurance: the value is shown as BOUNDED — feedback only nudges within
//     a small band, never swings. We say so explicitly.
//   - Private rooms: when the listing is a single room we surface the room
//     coefficient so the lower value reads as deliberate, not a penalty.
//
// Pure presentation — no new data, no endpoints. The value itself is the
// persisted nightlyKeys from the DTO (refreshed by the valuation cron).

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";
import type { ValuationExplanation } from "@/lib/keys/valuation";

// Map a factor key to its i18n label so we control wording per locale rather
// than trusting the English label stored in the explanation JSON.
const FACTOR_LABEL: Record<string, DictKey> = {
  base: "keys.explain.factor.base",
  size: "keys.explain.factor.size",
  sleeps: "keys.explain.factor.sleeps",
  location_tier: "keys.explain.factor.location_tier",
  verified: "keys.explain.factor.verified",
  ai_appeal: "keys.explain.factor.ai_appeal",
};

function fmtPoints(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function ValuationExplainer({
  nightlyKeys,
  explanation,
}: {
  nightlyKeys: number | null;
  explanation: ValuationExplanation;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const value = nightlyKeys ?? explanation.nightlyKeys;
  const isRoom = explanation.spaceType === "private_room";
  const adjustmentPct = Math.round(explanation.adjustment * 100);
  const feedbackApplied = explanation.feedback.applied && adjustmentPct !== 0;

  return (
    <section className="surface-card surface-card--static p-6">
      {/* Headline value + toggle. Always shows the number; the breakdown is the
          progressive disclosure below. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>
            {t("keys.explain.kicker")}
          </div>
          <h2 className="font-display text-xl tracking-[-0.01em] font-medium">
            {t("keys.explain.title")}
          </h2>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl leading-none" style={{ color: "var(--pink)" }}>
            {value}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mt-1" style={{ color: "var(--navy-3)" }}>
            {t("keys.explain.perNight")}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 font-mono text-[11px] uppercase tracking-[.08em]"
        style={{ color: "var(--pink)" }}
      >
        {open ? t("keys.explain.hide") : t("keys.explain.show")} {open ? "↑" : "↓"}
      </button>

      {open && (
        <div className="mt-5 space-y-5">
          <p className="text-sm" style={{ color: "var(--navy-2)" }}>
            {t("keys.explain.intro")}
          </p>

          {/* ---- Factors that build the base ---- */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
              {t("keys.explain.factorsTitle")}
            </div>
            <ul className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)" }}>
              {explanation.factors.map((f) => (
                <li
                  key={f.key}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-t first:border-t-0 text-sm"
                  style={{ borderColor: "var(--cream-2)" }}
                >
                  <span style={{ color: "var(--navy-2)" }}>
                    {FACTOR_LABEL[f.key] ? t(FACTOR_LABEL[f.key]) : f.label}
                  </span>
                  <span className="shrink-0 font-mono" style={{ color: "var(--navy-3)" }}>
                    {fmtPoints(f.points)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- Private room coefficient (C) ---- */}
          {isRoom && (
            <div className="rounded-xl p-4 text-sm" style={{ background: "var(--cream-2)" }}>
              <div className="font-medium mb-1">{t("keys.explain.roomTitle")}</div>
              <p style={{ color: "var(--navy-2)" }}>
                {t("keys.explain.roomBody", {
                  coefficient: explanation.roomsCoefficient,
                  percent: Math.round(explanation.roomsCoefficient * 100),
                })}
              </p>
            </div>
          )}

          {/* ---- Base → final, with the bounded feedback nudge ---- */}
          <div className="rounded-xl border" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span style={{ color: "var(--navy-2)" }}>{t("keys.explain.base")}</span>
              <span className="font-mono" style={{ color: "var(--navy-2)" }}>{explanation.base}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t text-sm" style={{ borderColor: "var(--cream-2)" }}>
              <span style={{ color: "var(--navy-2)" }}>
                {t("keys.explain.feedback")}
                {explanation.feedback.avgRating != null && (
                  <span style={{ color: "var(--navy-3)" }}>
                    {" "}· {t("keys.explain.reviews", {
                      rating: explanation.feedback.avgRating,
                      count: explanation.feedback.reviewCount,
                    })}
                  </span>
                )}
              </span>
              <span className="font-mono shrink-0" style={{ color: feedbackApplied ? "var(--pink)" : "var(--navy-3)" }}>
                {feedbackApplied ? `${adjustmentPct > 0 ? "+" : ""}${adjustmentPct}%` : t("keys.explain.feedbackNone")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: "var(--line)", background: "var(--pink-light)" }}>
              <span className="font-medium">{t("keys.explain.final")}</span>
              <span className="font-display text-lg" style={{ color: "var(--pink)" }}>{value}</span>
            </div>
          </div>

          {/* ---- Reassurance: the value is bounded and stable ---- */}
          <p className="text-[13px] leading-[1.6]" style={{ color: "var(--navy-3)" }}>
            {t("keys.explain.bounded")}
          </p>
        </div>
      )}
    </section>
  );
}
