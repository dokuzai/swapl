import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { swapProposalSchema } from "@/lib/validators";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureCanCreateProposal, bumpProposalCounter, PlanLimitError } from "@/lib/billing/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mobile inbox: returns proposals bucketed exactly like the /swaps page does.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const proposals = await prisma.swapProposal.findMany({
    where: {
      OR: [
        { proposerId: session.userId },
        { targetListing: { userId: session.userId } },
      ],
    },
    include: {
      proposerListing: { select: { id: true, city: true, neighbourhood: true, paletteHint: true } },
      targetListing: { select: { id: true, city: true, neighbourhood: true, userId: true, paletteHint: true } },
      proposer: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Look up the "other party" name in one pass.
  const otherIds = new Set<string>();
  proposals.forEach((p) => {
    const otherId = p.proposerId === session.userId ? p.targetListing.userId : p.proposerId;
    otherIds.add(otherId);
  });
  const others = await prisma.user.findMany({
    where: { id: { in: Array.from(otherIds) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(others.map((u) => [u.id, u.name]));

  const items = proposals.map((p) => {
    const meIsProposer = p.proposerId === session.userId;
    const otherUserId = meIsProposer ? p.targetListing.userId : p.proposerId;
    return {
      id: p.id,
      status: p.status,
      meSide: meIsProposer ? "proposer" : "target",
      dateFrom: p.dateFrom.toISOString(),
      dateTo: p.dateTo.toISOString(),
      message: p.message,
      myCity: meIsProposer ? p.proposerListing.city : p.targetListing.city,
      myNeighbourhood: meIsProposer ? p.proposerListing.neighbourhood : p.targetListing.neighbourhood,
      theirCity: meIsProposer ? p.targetListing.city : p.proposerListing.city,
      theirNeighbourhood: meIsProposer ? p.targetListing.neighbourhood : p.proposerListing.neighbourhood,
      otherName: nameById.get(otherUserId) ?? null,
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  const buckets = {
    waitingOnYou: items.filter((b) => b.meSide === "target" && (b.status === "PENDING" || b.status === "COUNTERED")),
    sent: items.filter((b) => b.meSide === "proposer" && (b.status === "PENDING" || b.status === "COUNTERED")),
    active: items.filter((b) => b.status === "ACCEPTED"),
    archived: items.filter((b) => b.status === "DECLINED" || b.status === "WITHDRAWN"),
  };

  return NextResponse.json({ buckets });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Plan-aware monthly cap (R6): Free = 3/mo, Plus/Pro = unlimited.
  try {
    await ensureCanCreateProposal(session.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json(
        { error: err.reason, upgradeTo: err.upgradeTo, currentPlan: err.currentPlan },
        { status: 402 }
      );
    }
    throw err;
  }

  // Anti-burst safety net for every plan tier (kept from v0).
  const rl = checkRateLimit(`proposals:${session.userId}`, 10, DAY_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're sending proposals faster than we can deliver. Try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = swapProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { proposerListingId, targetListingId, dateFrom, dateTo, message } = parsed.data;

  if (dateTo <= dateFrom) {
    return NextResponse.json({ error: "End date must be after start." }, { status: 400 });
  }

  const [mine, target] = await Promise.all([
    prisma.listing.findUnique({ where: { id: proposerListingId } }),
    prisma.listing.findUnique({ where: { id: targetListingId }, include: { user: true } }),
  ]);
  if (!mine || mine.userId !== session.userId) {
    return NextResponse.json({ error: "You can only propose with your own listing." }, { status: 403 });
  }
  if (!target) return NextResponse.json({ error: "Target listing not found" }, { status: 404 });
  if (target.userId === session.userId) {
    return NextResponse.json({ error: "Cannot swap with yourself." }, { status: 400 });
  }

  const proposal = await prisma.swapProposal.create({
    data: {
      proposerId: session.userId,
      proposerListingId,
      targetListingId,
      dateFrom,
      dateTo,
      message: message ?? null,
      status: "PENDING",
    },
  });

  // Bump the per-user counter only after a successful create so failed
  // validation paths don't burn quota.
  await bumpProposalCounter(session.userId);

  // Notify target via email + push.
  if (target.user?.email) {
    sendEmail(
      emailTemplates.proposalReceived(
        target.user.email,
        session.name ?? session.email,
        target.city
      )
    ).catch((err) => console.error("[proposal:email]", err));
  }
  sendPush(
    target.userId,
    pushTemplates.proposalReceived(proposal.id, session.name ?? session.email, target.city)
  ).catch((err) => console.error("[proposal:push]", err));

  return NextResponse.json({ ok: true, id: proposal.id });
}
