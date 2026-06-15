"use client";

// "Invite someone to stay at your place" (DOK-157). Pick one of YOUR listings,
// POST /api/referrals/invite-to-stay, get back a shareable token link. When the
// invitee joins and verifies, both sides earn KEYS (never money). Reuses the
// same Web Share + Copy affordance as the referral link.

import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";

type Listing = { id: string; title: string };

export function InviteToStay({ listings }: { listings: Listing[] }) {
  const t = useT();
  const [listingId, setListingId] = useState(listings[0]?.id ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (listings.length === 0) {
    return <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("invite.toStay.empty")}</p>;
  }

  function create() {
    setError(false);
    setLink(null);
    start(async () => {
      try {
        const res = await fetch("/api/referrals/invite-to-stay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; shareUrl?: string };
        if (res.ok && j.ok && j.shareUrl) setLink(j.shareUrl);
        else setError(true);
      } catch {
        setError(true);
      }
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* insecure context */
    }
  }

  async function share() {
    if (!link) return;
    const data = { title: "swapl", text: `${t("invite.share.text")} `, url: link };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* cancelled */
      }
    }
    await copy();
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("invite.toStay.pick")}
        </span>
        <select
          value={listingId}
          onChange={(e) => { setListingId(e.target.value); setLink(null); }}
          className="w-full px-3 py-2.5 rounded-lg border outline-none text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
      </label>

      {!link && (
        <button type="button" onClick={create} className="pill-primary" disabled={pending || !listingId}>
          {pending ? t("invite.toStay.creating") : t("invite.toStay.cta")}
        </button>
      )}

      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{t("invite.toStay.error")}</p>}

      {link && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--pink)" }}>{t("invite.toStay.linkReady")}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={link}
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
      )}
    </div>
  );
}
