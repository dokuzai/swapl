// /account/travel-windows (DOK-161) — the Travel windows editor: save the
// periods you want to travel, see the plan-tier counter ("2/3"), get a 402 +
// upgrade upsell over the limit, and — per window — the AI proposals section
// "Picked for your {month} trip" (real, available, date-compatible homes with
// a match badge and a link to a proposal / Stay-with-Keys booking).
//
// Mirrors the saved-searches page shell. The editor + proposals are interactive
// so they live in the client component; this server page just gates auth, loads
// the existing windows, and passes the plan cap down for the counter/upsell.

import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getSession } from "@/lib/auth/session";
import { getEffectivePlan } from "@/lib/billing/limits";
import { prisma } from "@/lib/db";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { TravelWindowsEditor, type TravelWindowDTO } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Travel windows · swapl" };

export default async function TravelWindowsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/travel-windows");

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const plan = await getEffectivePlan(session.userId);
  const rows = await prisma.travelWindow.findMany({
    where: { userId: session.userId },
    orderBy: { dateFrom: "asc" },
  });

  const items: TravelWindowDTO[] = rows.map((w) => ({
    id: w.id,
    dateFrom: w.dateFrom.toISOString().slice(0, 10),
    dateTo: w.dateTo.toISOString().slice(0, 10),
    flexible: w.flexible,
    destinations: w.destinations ? (JSON.parse(w.destinations) as string[]) : [],
    notes: w.notes,
  }));

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <p className="kicker mb-3">{t("tw.kicker")}</p>
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium mb-4">{t("tw.title")}</h1>
              <p className="text-[16px]" style={{ color: "var(--navy-2)" }}>{t("tw.intro")}</p>
            </header>

            <TravelWindowsEditor
              initialItems={items}
              maxWindows={plan.maxTravelWindows}
            />
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
