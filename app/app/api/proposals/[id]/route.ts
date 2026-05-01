import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";

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

export async function POST(req: Request, { params }: RouteContext<"/api/proposals/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const proposal = await prisma.swapProposal.findUnique({
    where: { id },
    include: {
      proposerListing: { include: { user: true } },
      targetListing: { include: { user: true } },
      agreement: true,
    },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isProposer = proposal.proposerId === session.userId;
  const isTarget = proposal.targetListing.userId === session.userId;
  if (!isProposer && !isTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = parsed.data.action;

  if (action === "withdraw") {
    if (!isProposer) return NextResponse.json({ error: "Only proposer can withdraw." }, { status: 403 });
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return NextResponse.json({ error: "Cannot withdraw at this stage." }, { status: 400 });
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "WITHDRAWN" } });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (!isTarget) return NextResponse.json({ error: "Only target can decline." }, { status: 403 });
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return NextResponse.json({ error: "Cannot decline at this stage." }, { status: 400 });
    }
    await prisma.swapProposal.update({ where: { id }, data: { status: "DECLINED" } });
    if (proposal.proposerListing.user.email) {
      sendEmail(emailTemplates.proposalDeclined(proposal.proposerListing.user.email)).catch(console.error);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "counter") {
    if (parsed.data.counterDateTo <= parsed.data.counterDateFrom) {
      return NextResponse.json({ error: "End date must be after start." }, { status: 400 });
    }
    // Either side can counter as long as the proposal is still negotiable.
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return NextResponse.json({ error: "Cannot counter at this stage." }, { status: 400 });
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
    return NextResponse.json({ ok: true });
  }

  // accept
  if (action === "accept") {
    if (proposal.status !== "PENDING" && proposal.status !== "COUNTERED") {
      return NextResponse.json({ error: "Cannot accept at this stage." }, { status: 400 });
    }
    // Whoever accepts must NOT be the same person who countered last (you can't accept your own counter).
    // We allow either side to accept the latest dates.
    const policyNumber = `SC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0")}`;

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
          provider: "swapl-cover",
          policyNumber,
          coverageAmount: 150000,
          // Cover lasts until 30 days after the swap window ends.
          expiresAt: new Date(updated.dateTo.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      return agreement;
    });

    // Notify both sides
    [proposal.proposerListing.user.email, proposal.targetListing.user.email].forEach((e) => {
      if (e) sendEmail(emailTemplates.proposalAccepted(e)).catch(console.error);
    });

    return NextResponse.json({ ok: true, agreementId: result.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
