import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { serialiseInterests, INTEREST_BY_SLUG, INTEREST_CATALOG, INTEREST_CATEGORIES, parseInterests } from "@/lib/interests";

// Mobile-friendly catalog + current selection. Categories let clients group
// the chips exactly like the web /account/interests page.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  const selected = session
    ? parseInterests(
        (await prisma.user.findUnique({ where: { id: session.userId }, select: { interests: true, bioVibe: true } }))?.interests ?? "[]"
      ).map((t) => t.slug)
    : [];
  return NextResponse.json({
    catalog: INTEREST_CATALOG,
    categories: INTEREST_CATEGORIES,
    selected,
  });
}

const schema = z.object({
  interests: z.array(z.string()).max(12),
  bioVibe: z.string().max(160).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
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
