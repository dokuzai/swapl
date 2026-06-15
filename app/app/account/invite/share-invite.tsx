"use client";

// Unified invite share (DOK-157). One mobile-first card, one Share CTA, with a
// picker that switches what gets shared:
//   - "My invite link": the always-ready referral link (?ref=CODE).
//   - "Invite to stay": mints a per-listing invite-to-stay token, then shares it.
// Both paths funnel into the SAME Web Share API + Copy affordance. The reward is
// stated explicitly up top (20 Keys per verified friend). BINDING: referrals
// earn KEYS, never money; the reward only lands when the invitee VERIFIES — the
// API/lib enforce this, the copy just says it.
//
// FRICTION (PM follow-up): invite-to-stay used to cost 3-4 taps (pick mode →
// reveal picker → "Create invite link" → share). Now it's ~2 taps, at parity
// with iOS ShareLink:
//   1. The listing <select> lives INLINE under the "stay" tile (no separate
//      reveal step), labelled with the mode.
//   2. Picking a listing AUTO-MINTS the token (POST on change) — no "Create
//      invite link" button.
//   3. The Share CTA fires the Web Share API immediately; if the token is still
//      minting it waits on the in-flight request. Copy fallback is preserved.
// The reward badge is sticky so it stays in view while choosing on a 390px
// screen.

import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";

type Listing = { id: string; title: string; isVerified: boolean };
type Mode = "link" | "stay";

export function ShareInvite({
  url,
  listings,
  reward,
  referee,
}: {
  /** Full referral link, e.g. https://swapl.fun/?ref=KWJ3YMF — the ONLY string
   *  we surface to copy/share, so users never wonder code-vs-link. */
  url: string;
  listings: Listing[];
  reward: number;
  referee: number;
}) {
  const t = useT();
  // What we render in the copyable pill: the link without the scheme so it
  // reads as a tappable link (swapl.fun/?ref=KWJ3YMF) while we still copy the
  // full `url`.
  const linkDisplay = url.replace(/^https?:\/\//, "");
  // Invite-to-stay only works from a VERIFIED listing: the friend's reward
  // qualifies on identity verification, but an invite minted from an unverified
  // listing leaves their Referral hanging (the API rejects it with
  // listing_not_verified). So the mode is only enabled when the host has at
  // least one verified home, and the picker lists only verified ones.
  const verifiedListings = listings.filter((l) => l.isVerified);
  const canInviteToStay = verifiedListings.length > 0;
  const hasUnverifiedOnly = listings.length > 0 && verifiedListings.length === 0;

  const [mode, setMode] = useState<Mode>("link");
  const [listingId, setListingId] = useState(verifiedListings[0]?.id ?? "");
  // Cache of minted invite-to-stay links keyed by listingId, so re-selecting a
  // listing we already coined doesn't hit the API again.
  const [stayLinks, setStayLinks] = useState<Record<string, string>>({});
  // Tracks the in-flight mint so the Share CTA can await the same promise
  // instead of firing a second POST.
  const mintInFlight = useRef<Promise<string | null> | null>(null);
  const [copied, setCopied] = useState(false);
  // null = no error; otherwise the i18n key of the message to show.
  const [error, setError] = useState<DictKey | null>(null);
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

  // Mints (once per listing) the invite-to-stay link for `id`, returning it.
  // Coalesces concurrent callers onto a single in-flight request.
  function mintStayLink(id: string): Promise<string | null> {
    const cached = stayLinks[id];
    if (cached) return Promise.resolve(cached);
    if (mintInFlight.current) return mintInFlight.current;

    const p = new Promise<string | null>((resolve) => {
      setError(null);
      start(async () => {
        try {
          const res = await fetch("/api/referrals/invite-to-stay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId: id }),
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            shareUrl?: string;
            code?: string;
          };
          if (res.ok && j.ok && j.shareUrl) {
            setStayLinks((prev) => ({ ...prev, [id]: j.shareUrl! }));
            resolve(j.shareUrl);
          } else if (res.status === 429) {
            // Rate-limited (too many invites this hour). Use the unified
            // cooldown copy shared with iOS/Android — it's a temporary
            // throttle, NOT a ban — instead of the generic "couldn't create".
            setError("invite.toStay.rateLimited");
            resolve(null);
          } else {
            // Surface the specific "verify your listing first" copy when the API
            // rejects an invite from an unverified listing; generic otherwise.
            setError(j.code === "listing_not_verified" ? "invite.toStay.unverified" : "invite.toStay.error");
            resolve(null);
          }
        } catch {
          setError("invite.toStay.error");
          resolve(null);
        } finally {
          mintInFlight.current = null;
        }
      });
    });
    mintInFlight.current = p;
    return p;
  }

  // Auto-mint when a listing is chosen (or when switching into "stay" mode with
  // a listing already selected), so the token is ready before the user taps
  // Share — collapsing the old "Create invite link" step.
  function selectListing(id: string) {
    setListingId(id);
    setError(null);
    setCopied(false);
    if (id) void mintStayLink(id);
  }

  // Resolves the link to share for the current mode, minting if needed.
  async function resolveLink(): Promise<string | null> {
    if (mode === "link") return url;
    if (!listingId) return null;
    return stayLinks[listingId] ?? mintStayLink(listingId);
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
    setError(null);
    setCopied(false);
    // Switching into "stay" with a listing already chosen pre-mints its token.
    if (next === "stay" && listingId && !stayLinks[listingId]) void mintStayLink(listingId);
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
      {/* ---- Reward, stated explicitly — STICKY so it stays in view while the
          user scrolls the picker on a small (390px) screen. ---- */}
      <div
        className="sticky top-2 z-10 flex items-center gap-3 rounded-xl px-3 py-2 -mx-1"
        style={{ background: "var(--pink-light)" }}
      >
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

          {/* "Invite to stay" tile. When enabled, the listing <select> is shown
              INLINE right below it (no separate reveal step), and choosing a
              listing auto-mints the token. */}
          {tile(
            "stay",
            t("invite.share.mode.stay"),
            canInviteToStay
              ? t("invite.share.mode.stayHint")
              : hasUnverifiedOnly
                ? t("invite.toStay.unverifiedHint")
                : t("invite.toStay.empty"),
            !canInviteToStay,
          )}

          {mode === "stay" && canInviteToStay && (
            <label className="block pl-1">
              <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {t("invite.toStay.pick")}
              </span>
              <select
                value={listingId}
                onChange={(e) => selectListing(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border outline-none text-sm"
                style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
              >
                {verifiedListings.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              {/* Confirms the token is ready so the next tap shares for real. */}
              {stayLinks[listingId] && !error && (
                <span className="block mt-1.5 text-[13px]" style={{ color: "var(--navy-2)" }}>
                  {t("invite.toStay.linkReady")}
                </span>
              )}
            </label>
          )}
        </div>
        {/* When the host has homes but none are verified, point them to verify
            the first one. */}
        {hasUnverifiedOnly && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--navy-2)" }}>
            {t("invite.toStay.unverified")}{" "}
            <a
              href={`/listings/${listings[0].id}/edit/verify`}
              className="underline"
              style={{ color: "var(--pink)" }}
            >
              {t("invite.toStay.verifyLink")}
            </a>
          </p>
        )}
      </div>

      {/* ---- The link being shared. We show ONE pre-formatted, copyable
          string — the full ?ref= link — and label it as "the link that
          counts", so non-technical users don't copy the bare code (KWJ3YMF)
          and wonder whether they also need the URL. Tapping copies the whole
          link; the code is no longer shown on its own. ---- */}
      {mode === "link" && (
        <div>
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("invite.code.label")}
          </span>
          <button
            type="button"
            onClick={() => void copyText(url)}
            className="w-full text-left font-mono text-[15px] px-4 py-3 rounded-xl break-all"
            style={{ background: "var(--cream-2)", color: "var(--navy)" }}
            aria-label={`${t("invite.code.label")}: ${linkDisplay}`}
          >
            {linkDisplay}
          </button>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--navy-2)" }}>
            {t("invite.link.hint")}
          </p>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{t(error)}</p>}

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
