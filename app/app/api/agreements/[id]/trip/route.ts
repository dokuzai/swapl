// Trip cockpit payload for one party (DOK-152). Returns the derived phase, a
// countdown, the caller's own key code + insurance, and — gated strictly
// server-side — the other home's exact address and home guide. Before the
// reveal gate opens we return only completeness percentages and a locked flag,
// never the other side's address or guide content.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, unauthenticated } from "@/lib/api/errors";
import { loadAgreement, resolveParty, computeGating, phaseOf } from "@/lib/trip/agreement";
import { tonExplorerUrl } from "@/lib/insurance/access";
import { HOME_GUIDE_CORE_FIELDS } from "@/lib/trip/phase";

const GUIDE_FIELDS = [
  ...HOME_GUIDE_CORE_FIELDS,
  "houseRules",
  "neighbourhood",
  "emergencyContact",
] as const;

function countdown(from: Date, now: Date) {
  const ms = from.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0 };
  return {
    days: Math.floor(ms / (24 * 60 * 60 * 1000)),
    hours: Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
  };
}

export async function GET(req: Request, { params }: RouteContext<"/api/agreements/[id]/trip">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;

  const agreement = await loadAgreement(id);
  if (!agreement) return notFound();

  const party = resolveParty(agreement, session.userId);
  if (!party) return forbidden();

  const now = new Date();
  const phase = phaseOf(agreement, now);
  const gating = computeGating(agreement, now);

  const myCompleteness = party.onSide1 ? gating.completeness1 : gating.completeness2;
  const otherCompleteness = party.onSide1 ? gating.completeness2 : gating.completeness1;

  const otherGuideRow = party.otherListing.homeGuide;
  const otherGuide = gating.unlocked
    ? otherGuideRow
      ? Object.fromEntries(GUIDE_FIELDS.map((f) => [f, otherGuideRow[f] ?? null]))
      : null
    : { locked: true as const, unlocksAt: gating.unlocksAt.toISOString() };

  // Checklist (derived booleans for the cockpit progress UI).
  const myEvents = agreement.checkEvents.filter((e) => e.userId === session.userId);
  const checklist = {
    guideFilled: myCompleteness === 100,
    detailsRead: gating.unlocked, // the other home's details are available to read
    checkedIn: myEvents.some((e) => e.type === "checkin"),
    checkedOut: myEvents.some((e) => e.type === "checkout"),
  };

  return NextResponse.json({
    agreementId: agreement.id,
    proposalId: agreement.proposalId,
    phase,
    role: party.onSide1 ? "host1" : "host2",
    dates: { from: agreement.dateFrom.toISOString(), to: agreement.dateTo.toISOString() },
    countdown: countdown(agreement.dateFrom, now),
    keyCodes: { mine: party.myKeyCode },
    insurance: agreement.insurancePolicy
      ? {
          policyNumber: agreement.insurancePolicy.policyNumber,
          coverageAmount: agreement.insurancePolicy.coverageAmount,
          status: agreement.insurancePolicy.status,
          expiresAt: agreement.insurancePolicy.expiresAt.toISOString(),
          // DOK-156 — proof-of-cover. Null when anchoring is disabled (env-gated).
          onChainStatus: agreement.insurancePolicy.onChainStatus ?? null,
          onChainRef: agreement.insurancePolicy.onChainRef ?? null,
          explorerUrl: tonExplorerUrl(
            agreement.insurancePolicy.onChainRef,
            agreement.insurancePolicy.onChainNetwork,
          ),
        }
      : null,
    addressUnlocked: gating.unlocked,
    otherAddress: gating.unlocked ? party.otherListing.address ?? null : null,
    otherCity: party.otherListing.city,
    otherGuide,
    myGuideCompleteness: myCompleteness,
    otherGuideCompleteness: otherCompleteness,
    checklist,
    checkEvents: agreement.checkEvents.map((e) => ({
      id: e.id,
      userId: e.userId,
      type: e.type,
      note: e.note,
      photos: JSON.parse(e.photos || "[]") as string[],
      createdAt: e.createdAt.toISOString(),
      mine: e.userId === session.userId,
    })),
  });
}
