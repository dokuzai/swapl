"use client";

// WaysToEarnKeys (DOK-164) — the "ways to earn Keys" surface on the wallet. It
// reads the server-owned catalogue from GET /api/keys/earn-ways (client-safe DTO
// only, no server imports) and lists every action that mints Keys: verify your
// identity, verify a property, complete a listing, leave a review, share a home
// that gets booked, and refer a friend. Each row shows the amount, a done/to-do
// state when the backend exposes it, and a single tap to the relevant page.
//
// Keys are travel points, never money — there is no purchase path here. The copy
// is encouraging, not spammy: gated rows are softened (not hidden) for an
// unverified member so they always know identity verification unlocks the rest.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";
import type { EarnWay, EarnWaysPayload } from "@/lib/keys/earn-ways-dto";

// Per-way presentation: an emoji glyph, an i18n title/body, and where the CTA
// goes. `key` is the stable identifier from the DTO, so copy/icon can't drift.
const WAY_UI: Record<
  EarnWay["key"],
  { icon: string; title: DictKey; body: DictKey; cta: DictKey; href: string }
> = {
  verify_identity: {
    icon: "🪪",
    title: "keys.ways.verify_identity.title",
    body: "keys.ways.verify_identity.body",
    cta: "keys.ways.verify_identity.cta",
    href: "/account",
  },
  verify_property: {
    icon: "🏠",
    title: "keys.ways.verify_property.title",
    body: "keys.ways.verify_property.body",
    cta: "keys.ways.verify_property.cta",
    href: "/dashboard",
  },
  complete_listing: {
    icon: "✨",
    title: "keys.ways.complete_listing.title",
    body: "keys.ways.complete_listing.body",
    cta: "keys.ways.complete_listing.cta",
    href: "/dashboard",
  },
  leave_review: {
    icon: "⭐",
    title: "keys.ways.leave_review.title",
    body: "keys.ways.leave_review.body",
    cta: "keys.ways.leave_review.cta",
    href: "/trips",
  },
  share_converted: {
    icon: "🔗",
    title: "keys.ways.share_converted.title",
    body: "keys.ways.share_converted.body",
    cta: "keys.ways.share_converted.cta",
    href: "/listings",
  },
  refer_friend: {
    icon: "💌",
    title: "keys.ways.refer_friend.title",
    body: "keys.ways.refer_friend.body",
    cta: "keys.ways.refer_friend.cta",
    href: "/account/invite",
  },
};

function WayRow({ way, identityVerified }: { way: EarnWay; identityVerified: boolean }) {
  const t = useT();
  const ui = WAY_UI[way.key];
  if (!ui) return null;

  // A row is locked when it needs identity and the member isn't verified yet.
  const locked = way.gatedOnIdentity && !identityVerified;
  // One-time, already-earned actions are "done"; repeatable ones never lock as done.
  const done = !way.repeatable && way.done;

  return (
    <li
      className="flex items-start gap-3 border-t pt-4 first:border-t-0 first:pt-0"
      style={{ borderColor: "var(--cream-2)", opacity: locked ? 0.6 : 1 }}
    >
      <span
        className="shrink-0 grid place-items-center w-9 h-9 rounded-full text-[17px]"
        style={{ background: "var(--cream-2)" }}
        aria-hidden
      >
        {ui.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{t(ui.title)}</span>
          <span
            className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] px-2 py-0.5 rounded-full"
            style={{ background: "var(--pink-light)", color: "var(--pink)" }}
          >
            +{way.amount}
          </span>
          {done && (
            <span
              className="shrink-0 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.06em] px-2 py-0.5 rounded-full"
              style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}
            >
              <span aria-hidden>✓</span> {t("keys.ways.done")}
            </span>
          )}
          {way.repeatable && (
            <span
              className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] px-2 py-0.5 rounded-full"
              style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
            >
              {t("keys.ways.repeatable")}
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--navy-2)" }}>
          {t(ui.body)}
        </p>
        {locked && (
          <p className="text-xs mt-1.5" style={{ color: "var(--navy-3)" }}>
            {t("keys.ways.lockedHint")}
          </p>
        )}
      </div>
      {!done && (
        <Link href={locked ? "/account" : ui.href} className="pill-ghost shrink-0 text-[13px] self-center">
          {locked ? t("keys.ways.verifyCta") : t(ui.cta)}
        </Link>
      )}
    </li>
  );
}

export function WaysToEarnKeys() {
  const t = useT();
  const [data, setData] = useState<EarnWaysPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/keys/earn-ways");
        if (!res.ok) throw new Error("bad status");
        const j = (await res.json()) as EarnWaysPayload;
        if (active) setData(j);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Stay quiet until we have data — this is an encouraging extra, not a blocker.
  if (error || !data) return null;

  return (
    <section className="mb-10" id="ways-to-earn">
      <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.ways.title")}</h2>
      <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
        {t("keys.ways.body")}
      </p>
      <div className="surface-card surface-card--static p-6">
        {!data.identityVerified && (
          <p
            className="text-sm mb-5 rounded-xl px-4 py-3"
            style={{ background: "var(--pink-light)", color: "var(--navy-2)" }}
          >
            {t("keys.ways.gateNote")}
          </p>
        )}
        <ul className="space-y-1">
          {data.ways.map((way) => (
            <WayRow key={way.key} way={way} identityVerified={data.identityVerified} />
          ))}
        </ul>
      </div>
    </section>
  );
}
