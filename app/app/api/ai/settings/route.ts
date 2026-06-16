import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { PROVIDERS } from "@/lib/ai/providers";
import { encryptSecret } from "@/lib/crypto";

const settingsSchema = z.object({
  // empty string == clear (revert to project default)
  provider: z.union([z.enum(PROVIDERS), z.literal("")]).optional(),
  model: z.string().max(120).optional(),
  apiKey: z.string().max(400).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });
  return NextResponse.json({
    provider: user?.aiProvider ?? "",
    model: user?.aiModel ?? "",
    // never expose the raw key to the client; just whether one is set
    hasKey: Boolean(user?.aiApiKey),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data: { aiProvider?: string | null; aiModel?: string | null; aiApiKey?: string | null } = {};
  if (parsed.data.provider !== undefined) data.aiProvider = parsed.data.provider || null;
  if (parsed.data.model !== undefined) data.aiModel = parsed.data.model || null;
  // Encrypt at rest — the raw provider key must never hit the DB in plaintext.
  if (parsed.data.apiKey !== undefined && parsed.data.apiKey !== "")
    data.aiApiKey = encryptSecret(parsed.data.apiKey);

  await prisma.user.update({ where: { id: session.userId }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await prisma.user.update({
    where: { id: session.userId },
    data: { aiProvider: null, aiModel: null, aiApiKey: null },
  });
  return NextResponse.json({ ok: true });
}
