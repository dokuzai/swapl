import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { getEffectivePlan } from "@/lib/billing/limits";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { marketingUrl } from "@/lib/marketing/urls";
import { prisma } from "@/lib/db";
import { SavedSearchTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved searches · swapl" };

export default async function SavedSearchesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/saved-searches");
  const plan = await getEffectivePlan(session.userId);

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  if (plan.id === "free") {
    return (
      <>
        <Navbar />
        <main className="flex-1">
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <p className="kicker mb-3">{t("savedSearch.kicker")}</p>
            <h1 className="font-display text-4xl tracking-[-0.02em] mb-4">{t("savedSearch.lockedTitle")}</h1>
            <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
              {t("savedSearch.lockedBody")}
            </p>
            <a href={marketingUrl("/pricing")} className="pill-primary">{t("savedSearch.seePlans")}</a>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const items = await prisma.savedSearch.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <p className="kicker mb-3">{t("savedSearch.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-4">{t("savedSearch.yourAlerts")}</h1>
          <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
            {t("savedSearch.intro", { used: items.length })}
          </p>
          <SavedSearchTable items={items.map((s) => ({
            id: s.id, name: s.name, query: s.query, alertEnabled: s.alertEnabled, createdAt: s.createdAt.toISOString(),
          }))} />
          <p className="mt-8 text-sm" style={{ color: "var(--navy-3)" }}>
            {t("savedSearch.tip")}{" "}
            <Link href="/listings" style={{ color: "var(--pink)" }}>{t("savedSearch.tipLink")}</Link>
          </p>
        </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
