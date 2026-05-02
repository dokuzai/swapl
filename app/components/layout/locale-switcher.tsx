"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_FLAG, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

// Compact pill that opens a flag-grid menu. POSTs the chosen locale to the
// cookie endpoint then refreshes so the next server render hydrates the right
// dictionary. We don't use next/navigation router.refresh() because the layout
// is force-dynamic and a hard reload is the simplest cache-bust here.
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    start(async () => {
      const res = await fetch("/api/i18n/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (res.ok) window.location.reload();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label={t("locale.label")}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 h-9 text-sm hover:bg-cream-2"
        style={{ background: "transparent" }}
      >
        <span aria-hidden className="text-base leading-none">{LOCALE_FLAG[locale]}</span>
        <span className="font-mono text-[11px] uppercase tracking-[.08em]">{locale}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 rounded-2xl border border-line bg-cream shadow-lg p-2 grid grid-cols-4 gap-1 z-50"
          style={{ background: "var(--cream)", minWidth: "12rem" }}
        >
          {LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                onClick={() => pick(l)}
                title={LOCALE_LABELS[l]}
                className="flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs hover:bg-cream-2"
                style={active ? { background: "var(--pink-light)" } : undefined}
              >
                <span aria-hidden className="text-lg leading-none">{LOCALE_FLAG[l]}</span>
                <span className="font-mono text-[10px] uppercase tracking-[.08em]">{l}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
