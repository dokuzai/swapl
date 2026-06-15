import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { marketingUrl } from "@/lib/marketing/urls";
import { formatDateRange } from "@/lib/listing-utils";
import SwapActions from "./swap-actions";
import { LeaveReview } from "./leave-review";
import { SwapContextPanel } from "./swap-context-panel";
import { TripCockpit } from "./trip-cockpit";
import { AffiliateLink } from "@/components/affiliate/affiliate-link";
import { ConciergeSection, type AddOn as ConciergeAddOn } from "@/components/concierge/concierge-section";
import { PersonalisedSuggestions } from "@/components/affiliate/personalised-suggestions";
import { getEffectivePlan } from "@/lib/billing/limits";
import { getConversations } from "../conversations";
import { ConversationList } from "../conversation-list";
import { ChatThread } from "./chat-thread";

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

  // Left column of the three-pane layout (DOK-150): same conversation list
  // as /swaps, with this thread highlighted.
  const conversations = await getConversations(session.userId);

  // Review eligibility (DOK-147): agreement COMPLETED and the caller has not
  // reviewed it yet — same gate as GET /api/proposals/{id}.
  let canReview = false;
  if (proposal.agreement && proposal.agreement.status === "COMPLETED") {
    const existing = await prisma.swapReview.findUnique({
      where: {
        agreementId_authorId: { agreementId: proposal.agreement.id, authorId: session.userId },
      },
      select: { id: true },
    });
    canReview = !existing;
  }

  // Concierge sidebar uses a small DB read; only do it when there's an active
  // agreement so the pre-acceptance thread stays cheap.
  let conciergeAddOns: ConciergeAddOn[] = [];
  let purchasedSlugs: string[] = [];
  let cityGuideIncluded = false;
  if (proposal.status === "ACCEPTED" && proposal.agreement) {
    const [addOnRows, orders, plan] = await Promise.all([
      prisma.addOn.findMany({ where: { isActive: true }, orderBy: { priceCents: "desc" } }),
      prisma.orderAddOn.findMany({
        where: { agreementId: proposal.agreement.id, userId: session.userId, status: "paid" },
        select: { addOn: { select: { slug: true } } },
      }),
      getEffectivePlan(session.userId),
    ]);
    conciergeAddOns = addOnRows.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      priceCents: a.priceCents,
      type: a.type as ConciergeAddOn["type"],
      category: a.category,
    }));
    purchasedSlugs = orders.map((o) => o.addOn.slug);
    cityGuideIncluded = plan.id !== "free";
  }

  const actions = (
    <SwapActions
      proposalId={proposal.id}
      status={proposal.status}
      isProposer={isProposer}
      canRespondAsTarget={canRespondAsTarget}
      canCounter={canCounter}
      currentDateFrom={proposal.dateFrom.toISOString().slice(0, 10)}
      currentDateTo={proposal.dateTo.toISOString().slice(0, 10)}
    />
  );

  const contextPanel = (
    <SwapContextPanel
      status={proposal.status}
      dateFrom={proposal.dateFrom.toISOString()}
      dateTo={proposal.dateTo.toISOString()}
      otherName={otherName}
      myListing={{
        id: myListing.id,
        city: myListing.city,
        neighbourhood: myListing.neighbourhood,
        sizeSqm: myListing.sizeSqm,
        sleeps: myListing.sleeps,
      }}
      theirListing={{
        id: theirListing.id,
        city: theirListing.city,
        neighbourhood: theirListing.neighbourhood,
        sizeSqm: theirListing.sizeSqm,
        sleeps: theirListing.sleeps,
      }}
      agreement={
        proposal.agreement
          ? {
              id: proposal.agreement.id,
              yourGuestCode: isProposer ? proposal.agreement.keyCode2 : proposal.agreement.keyCode1,
              yourCode: isProposer ? proposal.agreement.keyCode1 : proposal.agreement.keyCode2,
              insurancePolicy: proposal.agreement.insurancePolicy
                ? {
                    status: proposal.agreement.insurancePolicy.status,
                    coverageAmount: proposal.agreement.insurancePolicy.coverageAmount,
                    policyNumber: proposal.agreement.insurancePolicy.policyNumber,
                    documentsUrl: proposal.agreement.insurancePolicy.documentsUrl,
                  }
                : null,
            }
          : null
      }
      actions={actions}
      tripCockpit={
        proposal.agreement ? (
          <TripCockpit
            agreementId={proposal.agreement.id}
            myListingId={myListing.id}
            myUserId={session.userId}
            guestCode={isProposer ? proposal.agreement.keyCode2 : proposal.agreement.keyCode1}
            myCode={isProposer ? proposal.agreement.keyCode1 : proposal.agreement.keyCode2}
          />
        ) : undefined
      }
    />
  );

  return (
    <div className="wrap py-6 lg:py-10">
      <Link
        href="/swaps"
        className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block lg:hidden"
        style={{ color: "var(--navy-3)" }}
      >
        ← All swaps
      </Link>

      {/* Three-pane layout (DOK-150): conversations | thread | swap context. */}
      <div className="lg:grid lg:gap-8 lg:grid-cols-[320px_minmax(0,1fr)_340px] lg:items-start">
        <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="All conversations">
          <ConversationList conversations={conversations} activeId={proposal.id} />
        </aside>

        <div className="min-w-0">
          <header className="mb-6">
            <p className="kicker mb-3">Proposal · {proposal.status.toLowerCase()}</p>
            <h1 className="font-display text-3xl lg:text-4xl tracking-[-0.02em] leading-[1.05] font-medium">
              {myListing.neighbourhood} · {myListing.city}{" "}
              <span style={{ color: "var(--pink)" }}>⇄</span>{" "}
              {theirListing.neighbourhood} · {theirListing.city}
            </h1>
            <p className="mt-3" style={{ color: "var(--navy-2)" }}>
              with {otherName ?? "swapl host"} · {formatDateRange(proposal.dateFrom.toISOString(), proposal.dateTo.toISOString())}
            </p>
          </header>

          {/* Mobile: swap context collapses above the thread. */}
          <details className="lg:hidden surface-card mb-6 overflow-hidden">
            <summary
              className="cursor-pointer list-none p-4 font-mono text-[11px] uppercase tracking-[.08em] flex items-center justify-between"
              style={{ color: "var(--navy-2)" }}
            >
              Swap details
              <span aria-hidden style={{ color: "var(--navy-3)" }}>+</span>
            </summary>
            <div className="p-4 pt-0">{contextPanel}</div>
          </details>

          {/* Original proposal kept as compact, collapsible context above the
              live chat — the conversation itself is now the primary surface. */}
          <details className="surface-card mb-4 overflow-hidden">
            <summary
              className="cursor-pointer list-none p-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[.08em]"
              style={{ color: "var(--navy-2)" }}
            >
              <span>Original proposal · {formatDateRange(proposal.dateFrom.toISOString(), proposal.dateTo.toISOString())}</span>
              <span aria-hidden style={{ color: "var(--navy-3)" }}>+</span>
            </summary>
            <div className="p-4 pt-0">
              <p className="text-[15px] leading-[1.6] whitespace-pre-line">
                {proposal.message ?? <span style={{ color: "var(--navy-3)" }}>(no message)</span>}
              </p>
              {proposal.status === "COUNTERED" && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
                  <p className="font-mono text-xs uppercase tracking-[.08em] mb-2" style={{ color: "var(--pink)" }}>
                    Counter-offer ·{" "}
                    {proposal.counterDateFrom &&
                      proposal.counterDateTo &&
                      formatDateRange(proposal.counterDateFrom.toISOString(), proposal.counterDateTo.toISOString())}
                  </p>
                  <p className="text-[15px] leading-[1.6] whitespace-pre-line">
                    {proposal.counterMessage ?? <span style={{ color: "var(--navy-3)" }}>(no message)</span>}
                  </p>
                </div>
              )}
            </div>
          </details>

          {/* The real chat: bubbles, read ticks, composer with photo, polling. */}
          <div id="chat" className="mb-6">
            <ChatThread proposalId={proposal.id} otherName={otherName ?? "swapl host"} />
          </div>

          {proposal.status === "ACCEPTED" && proposal.agreement && (
            <section className="surface-card p-6 mb-6" style={{ background: "var(--navy)", color: "var(--cream)" }}>
              <h2 className="font-display text-xl mb-2" style={{ color: "var(--cream)" }}>
                Swap agreed — keys for keys
              </h2>
              <p className="text-sm" style={{ color: "color-mix(in oklab, var(--cream) 75%, transparent)" }}>
                Key codes and your insurance certificate live in the swap panel
                <span className="lg:hidden"> above</span>
                <span className="hidden lg:inline"> on the right</span>.
              </p>
            </section>
          )}

          {canReview && proposal.agreement && (
            <LeaveReview agreementId={proposal.agreement.id} otherName={otherName ?? "your swap partner"} />
          )}

          {proposal.status === "ACCEPTED" && proposal.agreement && (
            <>
              <ConciergeSection
                agreementId={proposal.agreement.id}
                destinationCity={theirListing.city}
                destinationCountry={theirListing.country}
                addOns={conciergeAddOns}
                alreadyPurchasedSlugs={purchasedSlugs}
                cityGuideIncluded={cityGuideIncluded}
              />

              {/* Interest-aware AI picks. Falls back to interest-keyed
                  templates when AI is unavailable, both with the same
                  card UI. Click attribution still flows through
                  /api/affiliate/[partnerSlug]. */}
              <PersonalisedSuggestions
                agreementId={proposal.agreement.id}
                destinationCity={theirListing.city}
                destinationCountry={theirListing.country}
              />

              <section className="mt-10">
                <p className="kicker mb-3">Plan the basics</p>
                <h2 className="font-display text-2xl tracking-[-0.01em] mb-4">Travel partners for {theirListing.city}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AffiliateLink partner="skyscanner" city={theirListing.city} agreementId={proposal.agreement.id} campaign="post_swap_flights" variant="card">
                    <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>Flights · Skyscanner</div>
                    <div className="font-display text-lg tracking-[-0.01em]">Find flights to {theirListing.city}</div>
                  </AffiliateLink>
                  <AffiliateLink partner="battleface" city={theirListing.city} agreementId={proposal.agreement.id} campaign="post_swap_insurance_upgrade" variant="card">
                    <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--navy-3)" }}>Premium cover · Battleface</div>
                    <div className="font-display text-lg tracking-[-0.01em]">Top up your travel insurance</div>
                  </AffiliateLink>
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--navy-3)" }}>
                  Disclosure: swapl earns a small referral when you book through these partners — never tied to your swap acceptance.
                </p>
              </section>

              <p className="mt-8">
                <a
                  href={marketingUrl(`/guides/${theirListing.city.toLowerCase()}`)}
                  className="pill-ghost"
                >
                  Read the {theirListing.city} city guide →
                </a>
              </p>
            </>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="Swap details">
          {contextPanel}
        </aside>
      </div>
    </div>
  );
}
