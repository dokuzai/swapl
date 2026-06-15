"use client";

// Shareable referral link with one-tap Share (Web Share API) + Copy fallback
// (DOK-157). Referrals earn KEYS, never money — the share text says so. The
// code/link come pre-minted from the server so there's nothing to fetch here.

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

export function ShareLink({ code, url }: { code: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flashCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      flashCopied();
    } catch {
      /* insecure context — nothing else to do */
    }
  }

  async function share() {
    const data = { title: "swapl", text: `${t("invite.share.text")} `, url };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await copy();
  }

  return (
    <div className="space-y-4">
      {/* The code, big and tappable to copy. */}
      <div>
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("invite.code.label")}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="font-display text-3xl tracking-[0.12em] px-4 py-2 rounded-xl"
          style={{ background: "var(--cream-2)", color: "var(--navy)" }}
        >
          {code}
        </button>
      </div>

      {/* The full link in a read-only field + the two actions. */}
      <div>
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("invite.link.label")}
        </span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 px-3 py-2.5 rounded-lg border outline-none text-sm font-mono"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void share()} className="pill-primary flex-1 sm:flex-none">
              {t("invite.share")}
            </button>
            <button type="button" onClick={() => void copy()} className="pill-ghost flex-1 sm:flex-none" aria-live="polite">
              {copied ? t("invite.share.copied") : t("invite.share.copy")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
