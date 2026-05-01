// Periodic sweep: turn off Listing.isFeatured once featuredUntil has passed.
// Idempotent — safe to run any number of times per minute.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const result = await prisma.listing.updateMany({
    where: { isFeatured: true, featuredUntil: { lte: new Date() } },
    data: { isFeatured: false },
  });
  return NextResponse.json({ ok: true, expired: result.count });
}
