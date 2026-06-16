import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { draftProposalMessage } from "@/lib/ai/proposal-message";
import { checkRateLimitDurable } from "@/lib/rate-limit";

const schema = z.object({
  proposerListingId: z.string().min(1),
  targetListingId: z.string().min(1),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  hostNotes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = await checkRateLimitDurable(`ai:proposal:${session.userId}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Slow down — try again in a few minutes." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [me, mine, target, user] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }),
    prisma.listing.findUnique({ where: { id: parsed.data.proposerListingId } }),
    prisma.listing.findUnique({ where: { id: parsed.data.targetListingId } }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { aiProvider: true, aiModel: true, aiApiKey: true },
    }),
  ]);

  if (!mine || mine.userId !== session.userId) {
    return NextResponse.json({ error: "You can only propose with your own listing." }, { status: 403 });
  }
  if (!target || target.userId === session.userId) {
    return NextResponse.json({ error: "Invalid target listing." }, { status: 400 });
  }

  const draft = await draftProposalMessage(
    {
      proposer: { name: me?.name ?? null, cityFrom: mine.city, neighbourhoodFrom: mine.neighbourhood },
      proposerListing: {
        sizeSqm: mine.sizeSqm,
        sleeps: mine.sleeps,
        petsAllowed: mine.petsAllowed,
        wfhSetup: mine.wfhSetup,
        stepFreeAccess: mine.stepFreeAccess,
        summary: mine.title,
      },
      targetListing: {
        title: target.title,
        cityTo: target.city,
        neighbourhoodTo: target.neighbourhood,
        sizeSqm: target.sizeSqm,
        sleeps: target.sleeps,
        petsAllowed: target.petsAllowed,
        wfhSetup: target.wfhSetup,
        stepFreeAccess: target.stepFreeAccess,
        bedrooms: target.bedrooms,
        propertyType: target.propertyType,
      },
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      hostNotes: parsed.data.hostNotes,
    },
    {
      userOverride: user
        ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
        : undefined,
    },
  );

  return NextResponse.json(draft);
}
