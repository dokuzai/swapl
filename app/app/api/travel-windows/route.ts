// Saved travel windows (DOK-161): a member's "I want to travel around these
// dates" intents. The AI turns each into ready-made swap proposals (see
// GET …/{id}/proposals) and the digest cron watches for new compatible homes.
//
// Tier-capped on create: Free=3, Plus=10, Pro=unlimited; admins bypass via
// getEffectivePlan. Over the cap returns 402 { error, upgradeTo, currentPlan }.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { ensureCanCreateTravelWindow, PlanLimitError } from "@/lib/billing/limits";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    dateFrom: z.string().regex(ISO_DATE, "dateFrom must be yyyy-MM-dd"),
    dateTo: z.string().regex(ISO_DATE, "dateTo must be yyyy-MM-dd"),
    flexible: z.boolean().optional(),
    destinations: z.array(z.string().min(1).max(80)).max(20).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.dateTo > v.dateFrom, { message: "dateTo must be after dateFrom", path: ["dateTo"] });

function toDTO(w: {
  id: string;
  dateFrom: Date;
  dateTo: Date;
  flexible: boolean;
  destinations: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: w.id,
    dateFrom: w.dateFrom.toISOString().slice(0, 10),
    dateTo: w.dateTo.toISOString().slice(0, 10),
    flexible: w.flexible,
    destinations: w.destinations ? (JSON.parse(w.destinations) as string[]) : [],
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const items = await prisma.travelWindow.findMany({
    where: { userId: session.userId },
    orderBy: { dateFrom: "asc" },
  });
  return NextResponse.json({ items: items.map(toDTO) });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await ensureCanCreateTravelWindow(session.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json(
        { error: err.reason, upgradeTo: err.upgradeTo, currentPlan: err.currentPlan },
        { status: 402 },
      );
    }
    throw err;
  }

  const created = await prisma.travelWindow.create({
    data: {
      userId: session.userId,
      dateFrom: new Date(parsed.data.dateFrom),
      dateTo: new Date(parsed.data.dateTo),
      flexible: parsed.data.flexible ?? false,
      destinations: parsed.data.destinations?.length ? JSON.stringify(parsed.data.destinations) : null,
      notes: parsed.data.notes ?? null,
    },
  });
  return NextResponse.json({ ok: true, window: toDTO(created) }, { status: 201 });
}
