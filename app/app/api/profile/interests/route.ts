import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { serialiseInterests, INTEREST_BY_SLUG } from "@/lib/interests";

const schema = z.object({
  interests: z.array(z.string()).max(12),
  bioVibe: z.string().max(160).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Drop unknown slugs silently — we never want a stale catalog to 400 an
  // existing profile.
  const valid = parsed.data.interests.filter((s) => INTEREST_BY_SLUG.has(s));
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      interests: serialiseInterests(valid),
      bioVibe: parsed.data.bioVibe ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
