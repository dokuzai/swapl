import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CityIllust, SwapArrows } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { formatDateRange } from "@/lib/listing-utils";
import SwapActions from "./swap-actions";

export const dynamic = "force-dynamic";

export default async function SwapThreadPage(props: PageProps<"/swaps/[id]">) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) return null;

  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposer: { select: { id: true, name: true, email: true } },
      proposerListing: { include: { user: { select: { id: true, name: true } } } },
      targetListing: { include: { user: { select: { id: true, name: true, email: true } } } },
      agreement: { include: { insurancePolicy: true } },
    },
  });
  if (!proposal) notFound();

  const isProposer = proposal.proposerId === session.userId;
  const isTarget = proposal.targetListing.userId === session.userId;
  if (!isProposer && !isTarget) notFound();

  const myListing = isProposer ? proposal.proposerListing : proposal.targetListing;
  const theirListing = isProposer ? proposal.targetListing : proposal.proposerListing;
  const otherName = isProposer ? proposal.targetListing.user.name : proposal.proposer.name;
  const canRespondAsTarget = isTarget && (proposal.status === "PENDING" || proposal.status === "COUNTERED");
  const canCounter = proposal.status === "PENDING" || proposal.status === "COUNTERED";

  return (
    <div className="wrap py-10 lg:py-14">
      <Link href="/swaps" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
        ← All swaps
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <header className="mb-8">
            <p className="kicker mb-3">Proposal · {proposal.status.toLowerCase()}</p>
            <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
              {myListing.neighbourhood} · {myListing.city}{" "}
              <span style={{ color: "var(--pink)" }}>⇄</span>{" "}
              {theirListing.neighbourhood} · {theirListing.city}
            </h1>
            <p className="mt-3" style={{ color: "var(--navy-2)" }}>
              with {otherName ?? "swapl host"} · {formatDateRange(proposal.dateFrom.toISOString(), proposal.dateTo.toISOString())}
            </p>
          </header>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <ListingThumb listing={myListing} label="Your home" />
            <ListingThumb listing={theirListing} label="Their home" />
          </div>

          <section className="surface-card p-6 mb-6">
            <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Original proposal</h2>
            <p className="font-mono text-xs uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
              {formatDateRange(proposal.dateFrom.toISOString(), proposal.dateTo.toISOString())}
            </p>
            <p className="text-[15px] leading-[1.6] whitespace-pre-line">
              {proposal.message ?? <span style={{ color: "var(--navy-3)" }}>(no message)</span>}
            </p>
          </section>

          {proposal.status === "COUNTERED" && (
            <section className="surface-card p-6 mb-6" style={{ background: "var(--pink-light)" }}>
              <h2 className="font-display text-xl tracking-[-0.01em] mb-3">Counter-offer</h2>
              <p className="font-mono text-xs uppercase tracking-[.08em] mb-2" style={{ color: "var(--pink)" }}>
                {proposal.counterDateFrom &&
                  proposal.counterDateTo &&
                  formatDateRange(proposal.counterDateFrom.toISOString(), proposal.counterDateTo.toISOString())}
              </p>
              <p className="text-[15px] leading-[1.6] whitespace-pre-line">
                {proposal.counterMessage ?? <span style={{ color: "var(--navy-3)" }}>(no message)</span>}
              </p>
            </section>
          )}

          {proposal.status === "ACCEPTED" && proposal.agreement && (
            <section className="surface-card p-6 mb-6" style={{ background: "var(--navy)", color: "var(--cream)" }}>
              <h2 className="font-display text-xl mb-3" style={{ color: "var(--cream)" }}>
                Swap agreed — keys for keys
              </h2>
              <div className="grid grid-cols-2 gap-5 mb-5">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "color-mix(in oklab, var(--cream) 60%, transparent)" }}>
                    Your guest's code (theirs to use at your place)
                  </div>
                  <div className="font-mono text-2xl tracking-widest">{isProposer ? proposal.agreement.keyCode2 : proposal.agreement.keyCode1}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-1" style={{ color: "color-mix(in oklab, var(--cream) 60%, transparent)" }}>
                    Your code (yours to use at their place)
                  </div>
                  <div className="font-mono text-2xl tracking-widest">{isProposer ? proposal.agreement.keyCode1 : proposal.agreement.keyCode2}</div>
                </div>
              </div>
              {proposal.agreement.insurancePolicy && (
                <p className="text-sm" style={{ color: "color-mix(in oklab, var(--cream) 75%, transparent)" }}>
                  Policy <span className="font-mono">{proposal.agreement.insurancePolicy.policyNumber}</span> · €
                  {proposal.agreement.insurancePolicy.coverageAmount.toLocaleString()} cover · 24/7 line:{" "}
                  <span className="font-mono">+44 800 000 swap</span>
                </p>
              )}
            </section>
          )}

          <SwapActions
            proposalId={proposal.id}
            status={proposal.status}
            isProposer={isProposer}
            canRespondAsTarget={canRespondAsTarget}
            canCounter={canCounter}
            currentDateFrom={proposal.dateFrom.toISOString().slice(0, 10)}
            currentDateTo={proposal.dateTo.toISOString().slice(0, 10)}
          />
        </div>

        <aside className="space-y-5">
          <div className="surface-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
              Insurance
            </div>
            {proposal.agreement?.insurancePolicy ? (
              <>
                <div className="font-display text-lg mb-2">€150,000 cover · active</div>
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                  Auto-issued on acceptance. Property damage, third-party liability and trip interruption — both directions.
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-lg mb-2">Auto-issued on acceptance</div>
                <p className="text-sm" style={{ color: "var(--navy-2)" }}>
                  When this swap is accepted, both homes are insured automatically. No checkbox, no upsell.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ListingThumb({
  listing,
  label,
}: {
  listing: { id: string; city: string; neighbourhood: string; sizeSqm: number; sleeps: number; title: string };
  label: string;
}) {
  return (
    <Link href={`/listings/${listing.id}`} className="surface-card overflow-hidden block">
      <div className="aspect-[4/3]">
        <CityIllust city={listing.city} palette={paletteForCity(listing.city)} />
      </div>
      <div className="p-4">
        <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {label}
        </div>
        <div className="font-display text-base mt-1">
          {listing.neighbourhood} · {listing.city}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--navy-3)" }}>
          {listing.sizeSqm}m² · sleeps {listing.sleeps}
        </div>
      </div>
    </Link>
  );
}
