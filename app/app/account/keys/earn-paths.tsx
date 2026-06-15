"use client";

// EarnPathsCard (DOK-155) — shown on /account/keys when the balance is 0 so the
// wallet is never a dead end. It mirrors the iOS earnPathsCard: three concrete
// ways to collect Keys (verify for the welcome bonus, host a stay, receive a
// gift), each a single tap to the relevant page. Keys are travel points, never
// money — no purchase path appears anywhere here.

import Link from "next/link";
import { useT } from "@/lib/i18n/client";

function EarnRow({
  title,
  body,
  badge,
  cta,
  href,
}: {
  title: string;
  body: string;
  badge?: string;
  cta?: string;
  href?: string;
}) {
  return (
    <li
      className="flex items-start justify-between gap-3 border-t pt-4 first:border-t-0 first:pt-0"
      style={{ borderColor: "var(--cream-2)" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span
              className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] px-2 py-0.5 rounded-full"
              style={{ background: "var(--pink-light)", color: "var(--pink)" }}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--navy-2)" }}>{body}</p>
      </div>
      {cta && href && (
        <Link href={href} className="pill-ghost shrink-0 text-[13px]">
          {cta}
        </Link>
      )}
    </li>
  );
}

export function EarnPathsCard({ welcomeBonus }: { welcomeBonus: number }) {
  const t = useT();
  return (
    <section className="mb-10">
      <div className="surface-card surface-card--static p-6" style={{ background: "var(--pink-light)" }}>
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.earn.title")}</h2>
        <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("keys.earn.body")}</p>
        <ul className="space-y-1">
          <EarnRow
            title={t("keys.earn.verify")}
            body={t("keys.earn.verifyBody", { count: welcomeBonus })}
            badge={`+${welcomeBonus}`}
            cta={t("keys.earn.verifyCta")}
            href="/account"
          />
          <EarnRow
            title={t("keys.earn.host")}
            body={t("keys.earn.hostBody")}
            cta={t("keys.earn.hostCta")}
            href="/listings/new"
          />
          <EarnRow
            title={t("keys.earn.gift")}
            body={t("keys.earn.giftBody")}
          />
        </ul>
      </div>
    </section>
  );
}
