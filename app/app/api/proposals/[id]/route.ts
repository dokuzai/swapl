import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { insuranceProvider } from "@/lib/insurance";
import { toDTO } from "@/lib/listing-utils";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("withdraw") }),
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
      proposerListing: { include: { user: { select: { id: true, name: true, avatar: true, verified: true } } } },
      targetListing: { include: { user: { select: { id: true, name: true, avatar: true, verified: true } } } },
      agreement: { include: { insurancePolicy: true } },
    },
  });
  if (!proposal) return notFound();

  const isProposer = proposal.proposerId === session.userId;
  const isTarget = proposal.targetListing.userId === session.userId;
  if (!isProposer && !isTarget) {
    return forbidden();
  }

  const other = isProposer ? proposal.targetListing.user : proposal.proposerListing.user;
  const agreement = proposal.agreement
    ? {
        id: proposal.agreement.id,
        dateFrom: proposal.agreement.dateFrom.toISOString(),
        dateTo: proposal.agreement.dateTo.toISOString(),
        // Only participants reach this branch, so it's safe to include keys.
        keyCode1: proposal.agreement.keyCode1,
        keyCode2: proposal.agreement.keyCode2,
        status: proposal.agreement.status,
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

  return NextResponse.json({
    proposal: {
      id: proposal.id,
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
    proposerListing: toDTO(proposal.proposerListing),
    targetListing: toDTO(proposal.targetListing),
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

  if (action === "withdraw") {
    if (!isProposer) return forbidden("Only proposer can withdraw.");
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot withdraw at this stage.");
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "WITHDRAWN" } });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (!isTarget) return forbidden("Only target can decline.");
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot decline at this stage.");
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "DECLINED" } });
    if (proposal.proposerListing.user.email) {
      sendEmail(emailTemplates.proposalDeclined(proposal.proposerListing.user.email)).catch(console.error);
    }
    sendPush(proposal.proposerId, pushTemplates.proposalDeclined(proposal.id)).catch(console.error);
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
    if (otherEmail) sendEmail(emailTemplates.proposalCountered(otherEmail)).catch(console.error);
    const otherUserId = isProposer ? proposal.targetListing.userId : proposal.proposerId;
    sendPush(otherUserId, pushTemplates.proposalCountered(proposal.id)).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  // accept
  if (action === "accept") {
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return invalidInput("Cannot accept at this stage.");
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

    const fallbackPolicyNumber = `SC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000000).toString().padStart(6, "0")}`;
    const fallbackExpiry = new Date(proposal.dateTo.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
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
          keyCode1: Math.floor(1000 + Math.random() * 9000).toString(),
          keyCode2: Math.floor(1000 + Math.random() * 9000).toString(),
          status: "ACTIVE",
        },
      });
      await tx.insurancePolicy.create({
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
      return agreement;
    });

    // Notify both sides
    [proposal.proposerListing.user.email, proposal.targetListing.user.email].forEach((e) => {
      if (e) sendEmail(emailTemplates.proposalAccepted(e)).catch(console.error);
    });
    [proposal.proposerId, proposal.targetListing.userId].forEach((uid) => {
      sendPush(uid, pushTemplates.proposalAccepted(proposal.id)).catch(console.error);
    });

    return NextResponse.json({ ok: true, agreementId: result.id });
  }

  return invalidInput("Unknown action");
}
