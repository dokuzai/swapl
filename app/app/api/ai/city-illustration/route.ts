import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { generateCityArt } from "@/lib/ai/city-illustration";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  city: z.string().min(1).max(80),
  country: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = checkRateLimit(`ai:city:${session.userId}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });

  const decision = await generateCityArt(parsed.data.city, parsed.data.country, {
    userOverride: user
      ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
      : undefined,
  });

  return NextResponse.json(decision);
}
