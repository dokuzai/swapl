"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";

export function CtaWaitlist() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await fetch("/api/beta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error(await res.text());
        setStatus("ok");
        setEmail("");
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <section id="join" className="text-center py-28 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <h2
          className="font-display font-medium leading-[1.02] tracking-[-0.03em] mb-6 mx-auto max-w-[20ch] text-balance"
          style={{ fontSize: "clamp(40px, 5vw, 72px)" }}
        >
          {t("cta.title")}
        </h2>
        <p className="mb-9 text-[18px]" style={{ color: "var(--navy-2)" }}>
          {t("cta.body")}
        </p>

        {status === "ok" ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto max-w-[480px] rounded-2xl border p-6 text-left"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
          >
            <div className="flex items-center gap-2 font-display text-[20px] tracking-[-0.01em] font-medium">
              <span aria-hidden style={{ color: "var(--pink)" }}>✓</span>
              {t("cta.sent")}
            </div>
            <p className="mt-2 text-[15px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
              {t("cta.confirmation")}
            </p>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="inline-flex items-center gap-2 p-1.5 border rounded-full max-w-[480px] w-full"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("cta.placeholder")}
              className="flex-1 bg-transparent border-0 px-5 py-3 outline-none"
              disabled={pending}
            />
            <button type="submit" className="pill-primary" disabled={pending}>
              {pending ? t("auth.forgot.submitting") : t("cta.button")}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-sm" style={{ color: "#dc2626" }}>
            {t("cta.error")}
          </p>
        )}

        <div className="mt-12 flex flex-wrap gap-6 justify-center font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          <span>{t("cta.stat.countries")}</span>
          <span>{t("cta.stat.insurance")}</span>
          <span>{t("cta.stat.noFees")}</span>
          <span>{t("cta.stat.noCommission")}</span>
        </div>
      </div>
    </section>
  );
}
