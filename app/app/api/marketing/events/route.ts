import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { marketingEventSchema } from "@/lib/validators";

export async function POST(req: Request) {
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
