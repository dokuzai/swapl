// Periodic sweep: mark ACTIVE swap agreements as COMPLETED once their stay
// window has fully passed. Idempotent — the where clause only ever matches
// agreements that haven't been completed yet.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const result = await prisma.swapAgreement.updateMany({
    where: { status: "ACTIVE", dateTo: { lt: new Date() } },
    data: { status: "COMPLETED" },
  });
  return NextResponse.json({ ok: true, completed: result.count });
}
