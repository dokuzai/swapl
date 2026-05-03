"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { attributionFromSearchParams, trackMarketingEvent } from "@/lib/marketing/attribution";

export function CtaWaitlist() {
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function attributionPayload() {
    return attributionFromSearchParams(searchParams, pathname);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const attribution = attributionPayload();
        const res = await fetch("/api/beta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, ...attribution }),
        });
        if (!res.ok) throw new Error(await res.text());
        trackMarketingEvent("subscriber_signup", {
          ...attribution,
          metadata: { placement: "footer_cta" },
        });
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

        <div className="mx-auto grid max-w-[820px] gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <form
            onSubmit={submit}
            className="flex w-full flex-col gap-2 border p-1.5 sm:flex-row sm:items-center"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)", borderRadius: 8 }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("cta.placeholder")}
              className="min-h-12 flex-1 bg-transparent px-4 py-3 outline-none"
              disabled={pending || status === "ok"}
            />
            <button type="submit" className="pill-primary justify-center" disabled={pending || status === "ok"}>
              {status === "ok" ? t("cta.sent") : pending ? t("auth.forgot.submitting") : t("cta.button")}
            </button>
          </form>

          <Link
            href="/register"
            className="pill-ghost justify-center whitespace-nowrap"
            onClick={() =>
              trackMarketingEvent("listing_intent_click", {
                ...attributionPayload(),
                metadata: { placement: "footer_cta" },
              })
            }
          >
            List before September
            <ArrowRight size={16} />
          </Link>
        </div>

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
