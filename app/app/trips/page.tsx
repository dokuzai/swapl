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
import { getTripPhase } from "@/lib/trip/phase";
import { KeysStayCard } from "./keys-stay-card";
import { SwapTripCard, type SwapTrip } from "./swap-trip-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trips · swapl" };

export default async function TripsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/trips");

  const { locale, dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  // Both sides of the member's travel: DIRECT two-way swaps (the primary flow,
  // SwapAgreement) AND non-simultaneous Keys stays. Listing them together is
  // what the page subtitle promises — querying only Keys stays gave anyone with
  // a real accepted swap a false "no trips yet" empty state.
  const [agreements, stays] = await Promise.all([
    prisma.swapAgreement.findMany({
      where: {
        OR: [{ listing1: { userId: session.userId } }, { listing2: { userId: session.userId } }],
      },
      include: {
        listing1: { select: { userId: true, city: true } },
        listing2: { select: { userId: true, city: true } },
        checkEvents: { select: { type: true, userId: true } },
        insurancePolicy: { select: { id: true } },
      },
      orderBy: { dateFrom: "desc" },
    }),
    prisma.keysStay.findMany({
      where: { OR: [{ guestId: session.userId }, { hostId: session.userId }] },
      include: { listing: { select: { id: true, title: true, city: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });

  const now = new Date();
  const swapTrips: SwapTrip[] = agreements.map((a) => {
    const onSide1 = a.listing1.userId === session.userId;
    const myListing = onSide1 ? a.listing1 : a.listing2;
    const otherListing = onSide1 ? a.listing2 : a.listing1;
    return {
      proposalId: a.proposalId,
      staysInCity: otherListing.city,
      theyStayInCity: myListing.city,
      dateRange: `${fmtDate(a.dateFrom)} – ${fmtDate(a.dateTo)}`,
      phase: getTripPhase(a, a.checkEvents, now),
      insured: Boolean(a.insurancePolicy),
    };
  });

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

            {swapTrips.length === 0 && items.length === 0 ? (
              // Both empty: one honest, page-level empty state.
              <div className="surface-card surface-card--static p-8 text-center">
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("trips.empty")}</p>
                <Link href="/listings" className="pill-primary mt-4 inline-flex">
                  {t("trips.empty.browse")}
                </Link>
              </div>
            ) : (
              <div className="space-y-12">
                {/* Direct two-way swaps. */}
                <section>
                  <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("trips.swaps.heading")}</h2>
                  {swapTrips.length === 0 ? (
                    <div className="surface-card surface-card--static p-6 text-center">
                      <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("trips.swaps.empty")}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {swapTrips.map((trip) => (
                        <SwapTripCard key={trip.proposalId} trip={trip} t={t} />
                      ))}
                    </div>
                  )}
                </section>

                {/* Non-simultaneous Keys stays. */}
                <section>
                  <h2 className="font-display text-2xl tracking-[-0.01em] mb-5">{t("trips.keys.heading")}</h2>
                  {items.length === 0 ? (
                    <div className="surface-card surface-card--static p-6 text-center">
                      <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("trips.keys.empty")}</p>
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
            )}
          </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
