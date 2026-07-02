"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";

const OPTIONS: Array<{ days: 14 | 30; price: number; labelKey: DictKey; subtitleKey: DictKey }> = [
  { days: 14, price: 19, labelKey: "featured.opt14", subtitleKey: "featured.opt14sub" },
  { days: 30, price: 29, labelKey: "featured.opt30", subtitleKey: "featured.opt30sub" },
];

export default function FeaturedForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const t = useT();
  const [duration, setDuration] = useState<14 | 30>(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buy() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/listings/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, durationDays: duration }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.ok) {
        router.refresh();
      } else {
        setError(j.error ?? t("featured.purchaseError"));
      }
    });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {OPTIONS.map((opt) => {
        const on = duration === opt.days;
        return (
          <button
            key={opt.days}
            onClick={() => setDuration(opt.days)}
            type="button"
            className="surface-card p-6 text-left transition-all"
            style={
              on
                ? { borderColor: "var(--pink)", background: "var(--pink-light)" }
                : { borderColor: "var(--line)" }
            }
          >
            <div className="font-display text-2xl tracking-[-0.01em]">{t(opt.labelKey)}</div>
            <div className="font-display text-3xl mt-2">€{opt.price}</div>
            <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>{t(opt.subtitleKey)}</p>
          </button>
        );
      })}
      <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
        {error && <span className="text-sm" style={{ color: "var(--destructive)" }}>{error}</span>}
        <button onClick={buy} disabled={pending} className="pill-primary">
          {pending ? t("featured.processing") : t("featured.boostFor", { days: duration })}
        </button>
      </div>
    </div>
  );
}
