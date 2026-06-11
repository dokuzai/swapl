import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";

const schema = z.object({
  action: z.enum(["resolve", "dismiss"]),
  resolution: z.string().trim().max(2000).optional(),
});

// POST /api/admin/reports/[id] — close a report with an outcome.
// "resolve" means action was taken (note what in `resolution`); "dismiss"
// means no action needed. Either way the report leaves the open queue.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/reports/[id]">) {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (report.status !== "open") {
    return NextResponse.json({ error: "Already closed" }, { status: 409 });
  }

  await prisma.report.update({
    where: { id },
    data: {
      status: parsed.data.action === "resolve" ? "resolved" : "dismissed",
      resolution: parsed.data.resolution || null,
      resolvedAt: new Date(),
      resolvedById: me.id,
    },
  });
  return NextResponse.json({ ok: true });
}
