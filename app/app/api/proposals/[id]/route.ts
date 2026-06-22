import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { insuranceProvider } from "@/lib/insurance";
import { anchorIssuedPolicy } from "@/lib/insurance/anchor";
import { chargeInspirePackageOnAccept, cancelInspirePackagePayment } from "@/lib/billing/inspire";
import { toDTO } from "@/lib/listing-utils";
import { publicContactChannels, ownContactChannels } from "@/lib/contact-channels";
import { accountSuspended, forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";
import { getTripPhase, guideUnlocked, homeGuideComplete } from "@/lib/trip/phase";
import { bookedRangesFor, rangesOverlap } from "@/lib/listing/availability";
import { recordProposalEvent, conversationForProposal } from "@/lib/conversations";
import { Prisma } from "@/generated/prisma/client";
import { isListingDateOverlapError, occupyListing } from "@/lib/listing/occupancy";
import { randomInt } from "node:crypto";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("withdraw") }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("unarchive") }),
  z.object({
    action: z.literal("counter"),
    counterDateFrom: z.coerce.date(),
    counterDateTo: z.coerce.date(),
    counterMessage: z.string().max(2000).optional(),
  }),
]);

// Mobile thread view. Returns the full proposal, both listings, the other
// party, and (for participants only on ACCEPTED) the agreement + insurance.
export async function GET(req: Request, { params }: RouteContext<"/api/proposals/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposerListing: { include: { user: { select: { id: true, name: true, avatar: true, verified: true, contactChannels: true } }, homeGuide: true } },
      targetListing: { include: { user: { select: { id: true, name: true, avatar: true, verified: true, contactChannels: true } }, homeGuide: true } },
      agreement: { include: { insurancePolicy: true, checkEvents: true } },
    },
  });
  if (!proposal) return notFound();

  const isProposer = proposal.proposerId === session.userId;
  const isTarget = proposal.targetListing.userId === session.userId;
  if (!isProposer && !isTarget) {
    return forbidden();
  }
  // Ownership keyed off the listing's userId so the reveal gate is exact
  // regardless of which side proposed the swap.
  const ownsProposer = proposal.proposerListing.userId === session.userId;
  const ownsTarget = proposal.targetListing.userId === session.userId;

  const otherUser = isProposer ? proposal.targetListing.user : proposal.proposerListing.user;
  // Off-platform contact channels unlock once the swap is accepted and the
  // agreement is still live or completed. A cancelled/INTERRUPTED swap re-locks
  // them. Locked by default (publicContactChannels returns null).
  const contactsUnlocked =
    proposal.agreement?.status === "ACTIVE" || proposal.agreement?.status === "COMPLETED";
  const other = {
    id: otherUser.id,
    name: otherUser.name,
    avatar: otherUser.avatar,
    verified: otherUser.verified,
    contactChannels: publicContactChannels(otherUser.contactChannels, { unlocked: contactsUnlocked }),
    // Lets the UI distinguish "they have channels that unlock on acceptance"
    // from "they share no off-platform contact" — without leaking values while
    // locked.
    hasContactChannels: Object.keys(ownContactChannels(otherUser.contactChannels)).length > 0,
  };

  // Review eligibility (DOK-147): the caller can review once the agreement is
  // COMPLETED and they have not reviewed it yet (one review per author).
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

  // Derived trip phase + reveal gate, so native clients get the cockpit's
  // headline state without a second round-trip (full payload lives at /trip).
  let phase: string | null = null;
  let addressUnlocked = false;
  if (proposal.agreement) {
    const now = new Date();
    phase = getTripPhase(proposal.agreement, proposal.agreement.checkEvents, now);
    const bothGuidesComplete =
      homeGuideComplete(proposal.proposerListing.homeGuide) &&
      homeGuideComplete(proposal.targetListing.homeGuide);
    addressUnlocked = guideUnlocked(proposal.agreement, now, bothGuidesComplete);
  }

  const agreement = proposal.agreement
    ? {
        id: proposal.agreement.id,
        dateFrom: proposal.agreement.dateFrom.toISOString(),
        dateTo: proposal.agreement.dateTo.toISOString(),
        // Only participants reach this branch, so it's safe to include keys.
        keyCode1: proposal.agreement.keyCode1,
        keyCode2: proposal.agreement.keyCode2,
        status: proposal.agreement.status,
        phase,
        addressUnlocked,
        canReview,
        insurance: proposal.agreement.insurancePolicy
          ? {
              policyNumber: proposal.agreement.insurancePolicy.policyNumber,
              coverageAmount: proposal.agreement.insurancePolicy.coverageAmount,
              status: proposal.agreement.insurancePolicy.status,
              expiresAt: proposal.agreement.insurancePolicy.expiresAt.toISOString(),
            }
          : null,
      }
    : null;

  // The per-transaction conversation (DOK-221) — lazily created so the detail
  // can open the unified in-app chat (text + lifecycle events).
  const conversation = await conversationForProposal(proposal.id);

  return NextResponse.json({
    proposal: {
      id: proposal.id,
      conversationId: conversation.id,
      status: proposal.status,
      meSide: isProposer ? "proposer" : "target",
      dateFrom: proposal.dateFrom.toISOString(),
      dateTo: proposal.dateTo.toISOString(),
      message: proposal.message,
      counterDateFrom: proposal.counterDateFrom?.toISOString() ?? null,
      counterDateTo: proposal.counterDateTo?.toISOString() ?? null,
      counterMessage: proposal.counterMessage,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    },
    // Each party always sees their OWN home's exact address + pin. The other
    // home's exact location is revealed only once the swap reveal gate opens
    // (addressUnlocked — dateFrom-48h or both guides complete); until then they
    // get the fuzzed area coordinate and a null address, like any public viewer.
    proposerListing: toDTO(proposal.proposerListing, {
      includeAddress: ownsProposer || addressUnlocked,
      includeExactCoords: ownsProposer || addressUnlocked,
    }),
    targetListing: toDTO(proposal.targetListing, {
      includeAddress: ownsTarget || addressUnlocked,
      includeExactCoords: ownsTarget || addressUnlocked,
    }),
    other,
    agreement,
  });
}

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return invalidInput("Invalid action");

  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposerListing: { include: { user: true } },
      targetListing: { include: { user: true } },
      agreement: true,
    },
  });
  if (!proposal) return notFound();

  const isProposer = proposal.proposerId === session.userId;
  const isTarget = proposal.targetListing.userId === session.userId;
  if (!isProposer && !isTarget) {
    return forbidden();
  }

  const action = parsed.data.action;

  // Per-party inbox archive: hides the thread from MY inbox only (sets my side's
  // flag). Allowed in any state, never touches the other party's view.
  if (action === "archive" || action === "unarchive") {
    const at = action === "archive" ? new Date() : null;
    await prisma.swapProposal.update({
      where: { id },
      data: isProposer ? { proposerArchivedAt: at } : { targetArchivedAt: at },
    });
    return NextResponse.json({ ok: true });
  }

  // Moderation: a swap cannot advance (accept/counter) while either party is
  // suspended — covers both a suspended caller and a suspended counterparty.
  // Withdraw/decline stay allowed so the other side isn't left hanging.
  if (
    (action === "accept" || action === "counter") &&
    (proposal.proposerListing.user.suspendedAt || proposal.targetListing.user.suspendedAt)
  ) {
    return accountSuspended();
  }

  if (action === "withdraw") {
    if (!isProposer) return forbidden("Only proposer can withdraw.");
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot withdraw at this stage.");
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "WITHDRAWN" } });
    // Pay-on-accept: a withdrawn proposal can never be charged.
    await cancelInspirePackagePayment(id).catch((err) => console.error("[inspire:cancel-payment]", err));
    recordProposalEvent(id, "withdrawn").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (!isTarget) return forbidden("Only target can decline.");
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot decline at this stage.");
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "DECLINED" } });
    // Pay-on-accept: a declined proposal can never be charged.
    await cancelInspirePackagePayment(id).catch((err) => console.error("[inspire:cancel-payment]", err));
    if (proposal.proposerListing.user.email) {
      sendEmail(emailTemplates.proposalDeclined(proposal.proposerListing.user.email), {
        kind: "proposalDeclined",
      }).catch(console.error);
    }
    sendPush(proposal.proposerId, pushTemplates.proposalDeclined(proposal.id)).catch(console.error);
    recordProposalEvent(id, "declined").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (action === "counter") {
    if (parsed.data.counterDateTo <= parsed.data.counterDateFrom) {
      return invalidInput("End date must be after start.");
    }
    // Either side can counter as long as the proposal is still negotiable.
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot counter at this stage.");
    }
    await prisma.swapProposal.update({
      where: { id },
      data: {
        status: "COUNTERED",
        counterDateFrom: parsed.data.counterDateFrom,
        counterDateTo: parsed.data.counterDateTo,
        counterMessage: parsed.data.counterMessage,
        // Also adopt the new dates as the working window.
        dateFrom: parsed.data.counterDateFrom,
        dateTo: parsed.data.counterDateTo,
      },
    });
    const otherEmail = isProposer ? proposal.targetListing.user.email : proposal.proposerListing.user.email;
    if (otherEmail)
      sendEmail(emailTemplates.proposalCountered(otherEmail), { kind: "proposalCountered" }).catch(
        console.error
      );
    const otherUserId = isProposer ? proposal.targetListing.userId : proposal.proposerId;
    sendPush(otherUserId, pushTemplates.proposalCountered(proposal.id)).catch(console.error);
    recordProposalEvent(id, "countered", {
      dateFrom: parsed.data.counterDateFrom.toISOString(),
      dateTo: parsed.data.counterDateTo.toISOString(),
      by: isProposer ? "proposer" : "host",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // accept
  if (action === "accept") {
    if (!isTarget) return forbidden("Only target can accept.");
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot accept at this stage.");
    }

    // Integrity gate (DOK-159): neither home may already be occupied for the
    // agreed window. Goes through the single availability helper so active
    // agreements, pending/confirmed Keys stays, and host blocks all count.
    const [occA, occB] = await Promise.all([
      bookedRangesFor(proposal.proposerListingId),
      bookedRangesFor(proposal.targetListingId),
    ]);
    const taken =
      occA.some((r) => rangesOverlap(proposal.dateFrom, proposal.dateTo, r.dateFrom, r.dateTo)) ||
      occB.some((r) => rangesOverlap(proposal.dateFrom, proposal.dateTo, r.dateFrom, r.dateTo));
    if (taken) {
      return invalidInput("One of the homes is no longer available for these dates.");
    }

    // Pre-issue the policy with the underwriter BEFORE the agreement tx so
    // we can persist the real premium / platform-share / external id atomically
    // with the rest of the swap state. If the provider call fails we still
    // create the agreement, but with policy.status = "pending" so retries
    // can fix it without blocking the user.
    const provider = insuranceProvider();
    const partyA = {
      userId: proposal.proposerListing.user.id,
      fullName: proposal.proposerListing.user.name ?? proposal.proposerListing.user.email,
      email: proposal.proposerListing.user.email,
      listing: {
        id: proposal.proposerListing.id,
        city: proposal.proposerListing.city,
        neighbourhood: proposal.proposerListing.neighbourhood,
        country: proposal.proposerListing.country,
        address: proposal.proposerListing.address,
        sizeSqm: proposal.proposerListing.sizeSqm,
      },
    };
    const partyB = {
      userId: proposal.targetListing.user.id,
      fullName: proposal.targetListing.user.name ?? proposal.targetListing.user.email,
      email: proposal.targetListing.user.email,
      listing: {
        id: proposal.targetListing.id,
        city: proposal.targetListing.city,
        neighbourhood: proposal.targetListing.neighbourhood,
        country: proposal.targetListing.country,
        address: proposal.targetListing.address,
        sizeSqm: proposal.targetListing.sizeSqm,
      },
    };

    let policyResult: Awaited<ReturnType<typeof provider.createPolicy>> | null = null;
    try {
      policyResult = await provider.createPolicy({
        agreementId: id,
        parties: [partyA, partyB],
        dateFrom: proposal.dateFrom,
        dateTo: proposal.dateTo,
      });
    } catch (err) {
      console.error("[insurance:create]", err);
    }

    const fallbackPolicyNumber = `SC-${new Date().getFullYear()}-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
    const fallbackExpiry = new Date(proposal.dateTo.getTime() + 30 * 24 * 60 * 60 * 1000);

    let result: { agreement: { id: string }; policyId: string };
    try {
      result = await prisma.$transaction(async (tx) => {
        const [txOccA, txOccB, txKeysA, txKeysB, txBlocksA, txBlocksB] = await Promise.all([
          tx.swapAgreement.findMany({
            where: {
              status: "ACTIVE",
              OR: [{ listing1Id: proposal.proposerListingId }, { listing2Id: proposal.proposerListingId }],
            },
            select: { dateFrom: true, dateTo: true },
          }),
          tx.swapAgreement.findMany({
            where: {
              status: "ACTIVE",
              OR: [{ listing1Id: proposal.targetListingId }, { listing2Id: proposal.targetListingId }],
            },
            select: { dateFrom: true, dateTo: true },
          }),
          tx.keysStay.findMany({
            where: { listingId: proposal.proposerListingId, status: { in: ["pending", "confirmed"] } },
            select: { dateFrom: true, dateTo: true },
          }),
          tx.keysStay.findMany({
            where: { listingId: proposal.targetListingId, status: { in: ["pending", "confirmed"] } },
            select: { dateFrom: true, dateTo: true },
          }),
          tx.listingBlockedRange.findMany({
            where: { listingId: proposal.proposerListingId },
            select: { dateFrom: true, dateTo: true },
          }),
          tx.listingBlockedRange.findMany({
            where: { listingId: proposal.targetListingId },
            select: { dateFrom: true, dateTo: true },
          }),
        ]);
        const allOccA = [...txOccA, ...txKeysA, ...txBlocksA];
        const allOccB = [...txOccB, ...txKeysB, ...txBlocksB];
        const txTaken =
          allOccA.some((r) => rangesOverlap(proposal.dateFrom, proposal.dateTo, r.dateFrom, r.dateTo)) ||
          allOccB.some((r) => rangesOverlap(proposal.dateFrom, proposal.dateTo, r.dateFrom, r.dateTo));
        if (txTaken) {
          throw new Error("DATES_TAKEN");
        }
        const updated = await tx.swapProposal.update({
          where: { id },
          data: { status: "ACCEPTED" },
        });
        const agreement = await tx.swapAgreement.create({
          data: {
            proposalId: updated.id,
            listing1Id: updated.proposerListingId,
            listing2Id: updated.targetListingId,
            dateFrom: updated.dateFrom,
            dateTo: updated.dateTo,
            keyCode1: randomInt(1000, 10000).toString(),
            keyCode2: randomInt(1000, 10000).toString(),
            status: "ACTIVE",
          },
        });
        await occupyListing(tx, {
          listingId: agreement.listing1Id,
          source: "swap_agreement",
          sourceId: agreement.id,
          dateFrom: agreement.dateFrom,
          dateTo: agreement.dateTo,
        });
        await occupyListing(tx, {
          listingId: agreement.listing2Id,
          source: "swap_agreement",
          sourceId: agreement.id,
          dateFrom: agreement.dateFrom,
          dateTo: agreement.dateTo,
        });
        const policy = await tx.insurancePolicy.create({
          data: {
            agreementId: agreement.id,
            provider: provider.name,
            policyNumber: policyResult?.policyNumber ?? fallbackPolicyNumber,
            coverageAmount: policyResult?.coverageAmount ?? 150_000,
            status: policyResult ? "active" : "pending",
            premiumCents: policyResult?.premiumCents ?? 0,
            platformShareCents: policyResult?.platformShareCents ?? 0,
            externalId: policyResult?.externalId ?? null,
            documentsUrl: policyResult?.documentsUrl ?? null,
            expiresAt: policyResult?.expiresAt ?? fallbackExpiry,
          },
        });
        return { agreement, policyId: policy.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if ((err instanceof Error && err.message === "DATES_TAKEN") || isListingDateOverlapError(err)) {
        return invalidInput("One of the homes is no longer available for these dates.");
      }
      throw err;
    }

    // DOK-156 — env-gated TON proof-of-cover. Fire-and-forget: anchoring the
    // certificate hash on-chain must NEVER block or fail acceptance. When the
    // TON env is unset this is a no-op and onChainRef stays null.
    void anchorIssuedPolicy(result.policyId);

    // Pay-on-accept (DOK-148): NOW — and only now — charge the confirmed
    // inspiration package linked to this proposal (selected concierge add-ons
    // only, off-session PaymentIntent on the card saved at checkout). A
    // failure never reverts the acceptance.
    await chargeInspirePackageOnAccept(id).catch((err) => console.error("[inspire:pay-on-accept]", err));

    // Notify both sides
    [proposal.proposerListing.user.email, proposal.targetListing.user.email].forEach((e) => {
      if (e) sendEmail(emailTemplates.proposalAccepted(e), { kind: "proposalAccepted" }).catch(console.error);
    });
    [proposal.proposerId, proposal.targetListing.userId].forEach((uid) => {
      sendPush(uid, pushTemplates.proposalAccepted(proposal.id)).catch(console.error);
    });

    recordProposalEvent(id, "accepted", {
      dateFrom: proposal.dateFrom.toISOString(),
      dateTo: proposal.dateTo.toISOString(),
    }).catch(() => {});

    return NextResponse.json({ ok: true, agreementId: result.agreement.id });
  }

  return invalidInput("Unknown action");
}
