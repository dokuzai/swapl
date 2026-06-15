// /account/keys (DOK-155) — the member's Keys wallet. Keys are TRAVEL POINTS,
// never money: this page shows the big balance, what each of their homes earns
// per night, the ledger history, and a capped "Gift Keys" form to a verified
// friend. No price, no purchase, no cash-out anywhere on this page.

import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { nightlyKeysFor } from "@/lib/keys/value";
import { GIFT_MAX_PER_TRANSFER, GIFT_DAILY_CAP } from "@/lib/keys/config";
import { GiftKeysForm } from "./gift-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keys · swapl" };

// Keys ledger kinds → an i18n label key. Mirrors KeysKind in lib/keys/ledger.
const KIND_KEY: Record<string, DictKey> = {
  earn_host: "keys.kind.earn_host",
  spend_stay: "keys.kind.spend_stay",
  welcome_bonus: "keys.kind.welcome_bonus",
  gift_sent: "keys.kind.gift_sent",
  gift_received: "keys.kind.gift_received",
  refund: "keys.kind.refund",
  hold: "keys.kind.hold",
  release: "keys.kind.release",
};

export default async function KeysPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/keys");

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const [user, listings, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { keysBalance: true, verified: true },
    }),
    prisma.listing.findMany({
      where: { userId: session.userId },
      select: { id: true, title: true, sizeSqm: true, sleeps: true, city: true, isVerified: true },
    }),
    prisma.keysTransaction.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  if (!user) redirect("/login");

  const balance = user.keysBalance;
  const homeValues = listings.map((l) => ({
    id: l.id,
    title: l.title,
    nightlyKeys: nightlyKeysFor({ sizeSqm: l.sizeSqm, sleeps: l.sleeps, city: l.city, isVerified: l.isVerified }),
  }));

  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <p className="kicker mb-3">{t("keys.kicker")}</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("keys.title")}</h1>
              <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>{t("keys.subtitle")}</p>
            </header>

            {/* ---- Big balance ---- */}
            <section className="mb-10">
              <div
                className="surface-card surface-card--static p-8 text-center"
                style={{ background: "var(--pink-light)" }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
                  {t("keys.balance.label")}
                </div>
                <div className="font-display text-6xl sm:text-7xl tracking-[-0.03em] leading-none" style={{ color: "var(--pink)" }}>
                  {balance}
                </div>
                <div className="font-mono text-xs uppercase tracking-[.1em] mt-2" style={{ color: "var(--navy-2)" }}>
                  {t("keys.balance.unit")}
                </div>
                {balance === 0 && (
                  <p className="text-sm mt-4" style={{ color: "var(--navy-2)" }}>{t("keys.balance.empty")}</p>
                )}
              </div>
            </section>

            {/* ---- Per-night value of your homes ---- */}
            <section className="mb-10">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.value.title")}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("keys.value.body")}</p>
              <div className="surface-card surface-card--static p-6">
                {homeValues.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("keys.value.empty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {homeValues.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                        style={{ borderColor: "var(--cream-2)" }}
                      >
                        <Link href={`/listings/${h.id}`} className="text-sm font-medium truncate hover:underline">
                          {h.title}
                        </Link>
                        <span
                          className="shrink-0 font-mono text-[11px] uppercase tracking-[.06em] px-2.5 py-1 rounded-full"
                          style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}
                        >
                          {t("keys.value.perNight", { count: h.nightlyKeys })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ---- Gift Keys ---- */}
            <section className="mb-10">
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-1">{t("keys.gift.title")}</h2>
              <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>{t("keys.gift.body")}</p>
              <div className="surface-card surface-card--static p-6">
                <GiftKeysForm
                  verified={user.verified}
                  maxPerTransfer={GIFT_MAX_PER_TRANSFER}
                  dailyCap={GIFT_DAILY_CAP}
                />
              </div>
            </section>

            {/* ---- Ledger history ---- */}
            <section>
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("keys.history.title")}</h2>
              <div className="surface-card surface-card--static p-6">
                {transactions.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("keys.history.empty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {transactions.map((tx) => {
                      const positive = tx.delta > 0;
                      const label = KIND_KEY[tx.kind] ? t(KIND_KEY[tx.kind]) : tx.kind;
                      return (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                          style={{ borderColor: "var(--cream-2)" }}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{label}</div>
                            <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                              {fmtDate(tx.createdAt)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div
                              className="font-display text-lg leading-none"
                              style={{ color: positive ? "var(--pink)" : "var(--navy-2)" }}
                            >
                              {positive ? "+" : ""}{tx.delta}
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                              {tx.balanceAfter}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
