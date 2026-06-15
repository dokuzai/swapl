// /account/keys/transactions (DOK-157) — the full, filterable Keys ledger,
// reached from "See all transactions" on the wallet. The list itself is a
// client component that pages the append-only ledger; this server shell just
// gates on the session and mounts the i18n provider + page chrome.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { KeysTransactionsList } from "./transactions-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keys transactions · swapl" };

export default async function KeysTransactionsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/keys/transactions");

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <Link
                href="/account/keys"
                className="inline-flex items-center gap-1.5 text-sm font-medium mb-4"
                style={{ color: "var(--pink)" }}
              >
                <span aria-hidden>←</span> {t("keys.tx.back")}
              </Link>
              <p className="kicker mb-3">{t("keys.tx.kicker")}</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("keys.tx.title")}</h1>
              <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
                {t("keys.tx.subtitle")}
              </p>
            </header>

            <KeysTransactionsList />
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
