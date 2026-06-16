import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { suggestAffiliateActivities } from "@/lib/ai/affiliate-suggestions";
import { parseInterests } from "@/lib/interests";
import { checkRateLimitDurable } from "@/lib/rate-limit";

const schema = z.object({
  agreementId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = await checkRateLimitDurable(`ai:affiliate:${session.userId}`, 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Slow down — try again in a few minutes." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [me, agreement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { interests: true, aiProvider: true, aiModel: true, aiApiKey: true },
    }),
    prisma.swapAgreement.findUnique({
      where: { id: parsed.data.agreementId },
      include: { listing1: true, listing2: true },
    }),
  ]);
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  if (![agreement.listing1.userId, agreement.listing2.userId].includes(session.userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // The destination is whichever side is *not* mine.
  const destination = agreement.listing1.userId === session.userId ? agreement.listing2 : agreement.listing1;
  const interests = parseInterests(me?.interests);

  const bundle = await suggestAffiliateActivities({
    city: destination.city,
    country: destination.country,
    interests,
    resolve: {
      userOverride: me ? { provider: me.aiProvider, model: me.aiModel, apiKey: me.aiApiKey } : undefined,
    },
  });

  return NextResponse.json(bundle);
}
