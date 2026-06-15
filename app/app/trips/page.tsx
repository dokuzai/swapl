// /trips (DOK-155) — the cockpit for non-simultaneous Keys stays. Shows every
// KeysStay where the member is guest or host; the host confirms or declines a
// pending request, the guest can cancel their own. On confirm the stay shows
// as a real, insured stay (a cover policy is issued by lib/insurance). This
// lives alongside /swaps (direct two-way swaps), never replacing it.

import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { KeysStayCard } from "./keys-stay-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trips · swapl" };

export default async function TripsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/trips");

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  const stays = await prisma.keysStay.findMany({
    where: { OR: [{ guestId: session.userId }, { hostId: session.userId }] },
    include: { listing: { select: { id: true, title: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });

  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });

  const items = stays.map((s) => ({
    id: s.id,
    role: (s.guestId === session.userId ? "guest" : "host") as "guest" | "host",
    listing: s.listing,
    dateRange: `${fmtDate(s.dateFrom)} – ${fmtDate(s.dateTo)}`,
    nights: s.nights,
    keysCost: s.keysCost,
    status: s.status,
    insured: Boolean(s.insurancePolicyId),
  }));

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
          <div className="wrap py-10 lg:py-14 max-w-3xl">
            <header className="mb-8">
              <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t("trips.title")}</h1>
              <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>{t("trips.subtitle")}</p>
            </header>

            <section>
              <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("trips.keys.heading")}</h2>

              {items.length === 0 ? (
                <div className="surface-card surface-card--static p-8 text-center">
                  <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("trips.keys.empty")}</p>
                  <Link href="/listings" className="pill-primary mt-4 inline-flex">
                    {t("nav.homes")}
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((s) => (
                    <KeysStayCard key={s.id} stay={s} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
