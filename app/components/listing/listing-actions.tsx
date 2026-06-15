"use client";

// Title-row actions for the listing detail page (DOK-150): Share (Web Share
// API with copy-link fallback) and Save (favorites — same state + endpoints
// as the browse-card heart, via the shared useFavorite hook).

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useFavorite } from "@/components/listing/favorite-heart";

const actionClass =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] font-medium cursor-pointer transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2";
const actionStyle = {
  borderColor: "var(--line)",
  background: "var(--card-bg)",
  color: "var(--navy)",
  outlineColor: "var(--pink)",
} as const;

export function ShareListingButton({ title, city }: { title: string; city: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function share() {
    const url = window.location.href;
    const data = { title: `${title} · ${city} · swapl`, url };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // Cancelled or unsupported payload — fall through to copy-link.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context) — nothing else we can do.
    }
  }

  return (
    <button type="button" onClick={() => void share()} className={actionClass} style={actionStyle} aria-label={t("listingActions.share")}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M8 7l4-4 4 4" />
        <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      </svg>
      <span aria-live="polite">{copied ? t("listingActions.linkCopied") : t("listingActions.shareShort")}</span>
    </button>
  );
}

export function SaveListingButton({ listingId }: { listingId: string }) {
  const t = useT();
  const { fav, toggle } = useFavorite(listingId);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={fav}
      aria-label={fav ? t("fav.remove") : t("fav.save")}
      className={actionClass}
      style={{ ...actionStyle, color: fav ? "var(--pink)" : "var(--navy)" }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ color: fav ? "var(--pink)" : "currentColor" }}
      >
        <path d="M12 20.5l-7.4-7.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 7.4 6.4L12 20.5z" />
      </svg>
      {fav ? "Saved" : "Save"}
    </button>
  );
}
