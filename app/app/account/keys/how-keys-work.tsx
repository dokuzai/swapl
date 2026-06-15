"use client";

// HowKeysWork (DOK-155 clarity) — the always-visible first-touch explainer on
// /account/keys. It makes the host → earn → stay flywheel visible in one glance
// and closes the loop with a single concrete example, so "travel points" stops
// being abstract. Keys are NEVER money: the body says so plainly. Pure
// pedagogy — no new data, no endpoints.

import { useT } from "@/lib/i18n/client";

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 grid place-items-center w-6 h-6 rounded-full font-mono text-[11px]"
        style={{ background: "var(--pink)", color: "#fff" }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>{body}</p>
      </div>
    </li>
  );
}

export function HowKeysWork() {
  const t = useT();
  return (
    <section className="mb-10">
      <div className="surface-card surface-card--static p-6">
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.how.title")}</h2>
        <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("keys.how.body")}</p>

        <ol className="space-y-4 mb-6">
          <Step n={1} title={t("keys.how.step1")} body={t("keys.how.step1Body")} />
          <Step n={2} title={t("keys.how.step2")} body={t("keys.how.step2Body")} />
          <Step n={3} title={t("keys.how.step3")} body={t("keys.how.step3Body")} />
        </ol>

        {/* Concrete example — closes the earn→spend loop in one card. */}
        <div className="rounded-xl p-4" style={{ background: "var(--pink-light)" }}>
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
            {t("keys.example.title")}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--navy-2)" }}>{t("keys.example.earn")}</span>
            <span className="shrink-0 font-medium" style={{ color: "var(--pink)" }}>{t("keys.example.earnValue")}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm mt-2 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
            <span style={{ color: "var(--navy-2)" }}>{t("keys.example.spend")}</span>
            <span className="shrink-0 font-medium" style={{ color: "var(--navy-2)" }}>{t("keys.example.spendValue")}</span>
          </div>
          <p className="text-sm mt-3" style={{ color: "var(--navy-2)" }}>{t("keys.example.caption")}</p>
        </div>
      </div>
    </section>
  );
}
