import { NextResponse } from "next/server";
import { prisma, parseJSON } from "@/lib/db";
import { swapProposalSchema } from "@/lib/validators";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { ensureCanCreateProposal, PlanLimitError } from "@/lib/billing/limits";
import { apiError, accountSuspended, forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mobile inbox: returns proposals bucketed exactly like the /swaps page does.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const proposals = await prisma.swapProposal.findMany({
    where: {
      OR: [
        { proposerId: session.userId },
        { targetListing: { userId: session.userId } },
      ],
    },
    include: {
      proposerListing: { select: { id: true, city: true, country: true, neighbourhood: true, paletteHint: true, photos: true } },
      targetListing: { select: { id: true, city: true, country: true, neighbourhood: true, userId: true, paletteHint: true, photos: true } },
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
    select: { id: true, name: true, avatar: true },
  });
  const nameById = new Map(others.map((u) => [u.id, u.name]));
  const avatarById = new Map(others.map((u) => [u.id, u.avatar]));

  // First photo of a listing, or null — `photos` is a JSON-encoded string[].
  const coverPhotoUrl = (listing: { photos: string }) =>
    parseJSON<string[]>(listing.photos, [])[0] ?? null;

  const items = proposals.map((p) => {
    const meIsProposer = p.proposerId === session.userId;
    const otherUserId = meIsProposer ? p.targetListing.userId : p.proposerId;
    const myListing = meIsProposer ? p.proposerListing : p.targetListing;
    const theirListing = meIsProposer ? p.targetListing : p.proposerListing;
    // Each party has its own archive flag, so I only ever see my own.
    const myArchivedAt = meIsProposer ? p.proposerArchivedAt : p.targetArchivedAt;
    return {
      id: p.id,
      status: p.status,
      meSide: meIsProposer ? "proposer" : "target",
      dateFrom: p.dateFrom.toISOString(),
      dateTo: p.dateTo.toISOString(),
      message: p.message,
      myCity: myListing.city,
      myNeighbourhood: myListing.neighbourhood,
      myCoverPhotoUrl: coverPhotoUrl(myListing),
      theirCity: theirListing.city,
      theirCountry: theirListing.country,
      theirNeighbourhood: theirListing.neighbourhood,
      theirCoverPhotoUrl: coverPhotoUrl(theirListing),
      otherName: nameById.get(otherUserId) ?? null,
      otherUserId,
      otherAvatar: avatarById.get(otherUserId) ?? null,
      updatedAt: p.updatedAt.toISOString(),
      archivedAt: myArchivedAt?.toISOString() ?? null,
    };
  });

  // Manually-archived threads, plus terminal (declined/withdrawn) ones, live in
  // Archived and are excluded from the active buckets.
  const isArchived = (b: (typeof items)[number]) =>
    b.archivedAt !== null || b.status === "DECLINED" || b.status === "WITHDRAWN";
  const buckets = {
    waitingOnYou: items.filter((b) => !isArchived(b) && b.meSide === "target" && (b.status === "PENDING" || b.status === "COUNTERED")),
    sent: items.filter((b) => !isArchived(b) && b.meSide === "proposer" && (b.status === "PENDING" || b.status === "COUNTERED")),
    active: items.filter((b) => !isArchived(b) && b.status === "ACCEPTED"),
    archived: items.filter(isArchived),
  };

  return NextResponse.json({ buckets });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return unauthenticated();
  }

  // Moderation: suspended users keep read access but cannot propose.
  // (Web cookie sessions are stateless, so this must be checked per request.)
  const caller = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { suspendedAt: true },
  });
  if (!caller) return unauthenticated();
  if (caller.suspendedAt) {
    return accountSuspended();
  }

  // Anti-burst safety net for every plan tier (kept from v0).
  const rl = await checkRateLimitDurable(`proposals:${session.userId}`, 10, DAY_MS);
  if (!rl.ok) {
    return apiError(429, "You're sending proposals faster than we can deliver. Try again later.");
  }

  const body = await req.json().catch(() => null);
  const parsed = swapProposalSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput("Invalid input", { issues: parsed.error.issues });
  }
  const { proposerListingId, targetListingId, dateFrom, dateTo, message } = parsed.data;

  if (dateTo <= dateFrom) {
    return invalidInput("End date must be after start.");
  }

  const [mine, target] = await Promise.all([
    prisma.listing.findUnique({ where: { id: proposerListingId } }),
    prisma.listing.findUnique({ where: { id: targetListingId }, include: { user: true } }),
  ]);
  if (!mine || mine.userId !== session.userId) {
    return forbidden("You can only propose with your own listing.");
  }
  if (!target) return notFound("Target listing not found");
  if (target.userId === session.userId) {
    return invalidInput("Cannot swap with yourself.");
  }

  // Plan-aware monthly cap (R6): Free = 3/mo, Plus/Pro = unlimited.
  // Atomic check-and-increment only AFTER all validation passes, so failed
  // requests (429, invalid body, ownership check, etc.) don't burn quota.
  try {
    await ensureCanCreateProposal(session.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return apiError(402, err.reason, { upgradeTo: err.upgradeTo, currentPlan: err.currentPlan });
    }
    throw err;
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

  // Notify target via email + push.
  if (target.user?.email) {
    sendEmail(
      emailTemplates.proposalReceived(
        target.user.email,
        session.name ?? session.email,
        target.city
      ),
      { kind: "proposalReceived" }
    ).catch((err) => console.error("[proposal:email]", err));
  }
  sendPush(
    target.userId,
    pushTemplates.proposalReceived(proposal.id, session.name ?? session.email, target.city)
  ).catch((err) => console.error("[proposal:push]", err));

  return NextResponse.json({ ok: true, id: proposal.id });
}
