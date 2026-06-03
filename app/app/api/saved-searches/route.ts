import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/abilities";
import { PlanLimitError } from "@/lib/billing/limits";

const schema = z.object({
  name: z.string().min(2).max(80),
  query: z.string().max(2000),
  alertEnabled: z.boolean().optional(),
});

const MAX_PER_USER = 20;

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireMembership("plus");
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json(
        { error: err.reason, upgradeTo: err.upgradeTo, currentPlan: err.currentPlan },
        { status: 402 },
      );
    }
    throw err;
  }
  const items = await prisma.savedSearch.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireMembership("plus");
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json(
        { error: err.reason, upgradeTo: err.upgradeTo, currentPlan: err.currentPlan },
        { status: 402 },
      );
    }
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const count = await prisma.savedSearch.count({ where: { userId: session.userId } });
  if (count >= MAX_PER_USER) {
    return NextResponse.json({ error: `You can keep up to ${MAX_PER_USER} saved searches.` }, { status: 409 });
  }

  const created = await prisma.savedSearch.create({
    data: {
      userId: session.userId,
      name: parsed.data.name,
      query: parsed.data.query,
      alertEnabled: parsed.data.alertEnabled ?? true,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
