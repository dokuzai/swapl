"use client";

// Unified invite share (DOK-157). One mobile-first card, one Share CTA, with a
// picker that switches what gets shared:
//   - "My invite link": the always-ready referral link (?ref=CODE).
//   - "Invite to stay": mints a per-listing invite-to-stay token, then shares it.
// Both paths funnel into the SAME Web Share API + Copy affordance. The reward is
// stated explicitly up top (20 Keys per verified friend). BINDING: referrals
// earn KEYS, never money; the reward only lands when the invitee VERIFIES — the
// API/lib enforce this, the copy just says it.

import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";

type Listing = { id: string; title: string };
type Mode = "link" | "stay";

export function ShareInvite({
  code,
  url,
  listings,
  reward,
  referee,
}: {
  code: string;
  url: string;
  listings: Listing[];
  reward: number;
  referee: number;
}) {
  const t = useT();
  const canInviteToStay = listings.length > 0;

  const [mode, setMode] = useState<Mode>("link");
  const [listingId, setListingId] = useState(listings[0]?.id ?? "");
  // The link that will actually be shared. For "link" mode it's the referral
  // url; for "stay" mode it's minted on demand and cached per listing.
  const [stayLink, setStayLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flashCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied();
    } catch {
      /* insecure context — nothing else to do */
    }
  }

  // Mints (once per listing) the invite-to-stay link, returning it.
  function mintStayLink(): Promise<string | null> {
    if (stayLink) return Promise.resolve(stayLink);
    return new Promise((resolve) => {
      setError(false);
      start(async () => {
        try {
          const res = await fetch("/api/referrals/invite-to-stay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId }),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; shareUrl?: string };
          if (res.ok && j.ok && j.shareUrl) {
            setStayLink(j.shareUrl);
            resolve(j.shareUrl);
          } else {
            setError(true);
            resolve(null);
          }
        } catch {
          setError(true);
          resolve(null);
        }
      });
    });
  }

  // Resolves the link to share for the current mode, minting if needed.
  async function resolveLink(): Promise<string | null> {
    if (mode === "link") return url;
    return mintStayLink();
  }

  async function share() {
    const link = await resolveLink();
    if (!link) return;
    const data = { title: "swapl", text: `${t("invite.share.text")} `, url: link };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await copyText(link);
  }

  async function copy() {
    const link = await resolveLink();
    if (link) await copyText(link);
  }

  function pickMode(next: Mode) {
    setMode(next);
    setError(false);
    setCopied(false);
  }

  const tile = (m: Mode, label: string, hint: string, disabled = false) => {
    const active = mode === m;
    return (
      <button
        type="button"
        onClick={() => pickMode(m)}
        disabled={disabled}
        aria-pressed={active}
        className="w-full text-left rounded-xl border px-4 py-3 transition disabled:opacity-50"
        style={{
          borderColor: active ? "var(--pink)" : "var(--line)",
          background: active ? "var(--pink-light)" : "var(--card-bg)",
        }}
      >
        <span className="block text-sm font-medium" style={{ color: "var(--navy)" }}>{label}</span>
        <span className="block text-[13px] mt-0.5" style={{ color: "var(--navy-2)" }}>{hint}</span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* ---- Reward, stated explicitly ---- */}
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 grid place-items-center rounded-full font-display text-lg"
          style={{ width: 52, height: 52, background: "var(--pink)", color: "#fff" }}
          aria-hidden
        >
          +{reward}
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-tight" style={{ color: "var(--navy)" }}>
            {t("invite.share.reward", { reward })}
          </p>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--navy-2)" }}>
            {t("invite.share.rewardHint", { reward, referee })}
          </p>
        </div>
      </div>

      {/* ---- Picker: what to share ---- */}
      <div>
        <span className="block mb-2 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("invite.share.pick")}
        </span>
        <div className="space-y-2">
          {tile("link", t("invite.share.mode.link"), t("invite.share.mode.linkHint"))}
          {tile(
            "stay",
            t("invite.share.mode.stay"),
            canInviteToStay ? t("invite.share.mode.stayHint") : t("invite.toStay.empty"),
            !canInviteToStay,
          )}
        </div>
      </div>

      {/* ---- Listing picker, only for invite-to-stay ---- */}
      {mode === "stay" && canInviteToStay && (
        <label className="block">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("invite.toStay.pick")}
          </span>
          <select
            value={listingId}
            onChange={(e) => { setListingId(e.target.value); setStayLink(null); setError(false); }}
            className="w-full px-3 py-3 rounded-lg border outline-none text-sm"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          >
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        </label>
      )}

      {/* ---- The link being shared (referral link is always visible) ---- */}
      {mode === "link" && (
        <div>
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("invite.code.label")}
          </span>
          <button
            type="button"
            onClick={() => void copyText(code)}
            className="font-display text-2xl tracking-[0.12em] px-4 py-2 rounded-xl"
            style={{ background: "var(--cream-2)", color: "var(--navy)" }}
          >
            {code}
          </button>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{t("invite.toStay.error")}</p>}

      {/* ---- One Share CTA + Copy fallback ---- */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void share()}
          disabled={pending}
          className="pill-primary w-full justify-center text-center py-3"
        >
          {pending ? t("invite.share.sharing") : t("invite.share.cta")}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={pending}
          className="pill-ghost w-full justify-center text-center py-3"
          aria-live="polite"
        >
          {copied ? t("invite.share.copied") : t("invite.share.or")}
        </button>
      </div>
    </div>
  );
}
