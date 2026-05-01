import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { swapProposalSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // 10 proposals / day per user.
  const rl = checkRateLimit(`proposals:${session.userId}`, 10, DAY_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Daily proposal limit reached. Try again tomorrow." },
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
