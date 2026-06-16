import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { marketingEventSchema } from "@/lib/validators";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`marketing-events:${ip}`, 120, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = marketingEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { metadata, ...data } = parsed.data;
  await prisma.marketingEvent.create({
    data: {
      ...data,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
