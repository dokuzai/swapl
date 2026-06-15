// A single DIRECT two-way swap on /trips (DOK-155 follow-up). The /trips page
// is the member's "home swaps and Keys stays in one place" — before this it
// only listed KeysStay rows, so anyone with a real accepted swap (the primary
// product flow) saw a FALSE empty state. This card surfaces those agreements.
//
// Server component: a swap trip has no inline actions here — the cockpit lives
// at /swaps/[proposalId], so the whole card is a link into it.

import Link from "next/link";
import type { DictKey } from "@/lib/i18n/dict-en";
import type { TripPhase } from "@/lib/trip/phase";

export type SwapTrip = {
  proposalId: string;
  // The home the member travels TO (their counterpart's listing).
  staysInCity: string;
  // The home the member offers (their own listing's city).
  theyStayInCity: string;
  dateRange: string;
  phase: TripPhase;
  insured: boolean;
};

const PHASE_KEY: Record<TripPhase, DictKey> = {
  AGREED: "trip.phase.AGREED",
  PREPARING: "trip.phase.PREPARING",
  READY: "trip.phase.READY",
  IN_PROGRESS: "trip.phase.IN_PROGRESS",
  COMPLETED: "trip.phase.COMPLETED",
  INTERRUPTED: "trip.phase.INTERRUPTED",
};

function phaseStyle(phase: TripPhase): { bg: string; fg: string } {
  if (phase === "READY" || phase === "IN_PROGRESS") return { bg: "var(--pink)", fg: "#fff" };
  if (phase === "INTERRUPTED") return { bg: "var(--cream-2)", fg: "var(--navy-3)" };
  return { bg: "var(--cream-2)", fg: "var(--navy-3)" };
}

export function SwapTripCard({
  trip,
  t,
}: {
  trip: SwapTrip;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const pStyle = phaseStyle(trip.phase);

  return (
    <Link
      href={`/swaps/${trip.proposalId}`}
      className="surface-card surface-card--static p-5 block hover:no-underline"
      aria-label={t("trips.swaps.open")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "var(--navy-3)" }}>
            {t("trips.swaps.theyStayIn", { city: trip.theyStayInCity })}
          </div>
          <div className="font-display text-xl tracking-[-0.01em]">
            {t("trips.swaps.youStayIn", { city: trip.staysInCity })}
          </div>
          <div className="text-sm mt-0.5" style={{ color: "var(--navy-2)" }}>
            {trip.dateRange}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
            style={{ background: pStyle.bg, color: pStyle.fg }}
          >
            {t(PHASE_KEY[trip.phase])}
          </span>
          {trip.insured && (
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--pink)" }}>
              ◦ {t("trips.keys.insured")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
