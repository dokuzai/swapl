import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { swapProposalSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureCanCreateProposal, bumpProposalCounter, PlanLimitError } from "@/lib/billing/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const session = await getSession();
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

  // Notify target
  if (target.user?.email) {
    sendEmail(
      emailTemplates.proposalReceived(
        target.user.email,
        session.name ?? session.email,
        target.city
      )
    ).catch((err) => console.error("[proposal:email]", err));
  }

  return NextResponse.json({ ok: true, id: proposal.id });
}
