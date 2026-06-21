import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";
import { Prisma } from "@/generated/prisma/client";
import { openDateRange } from "@/lib/listing/host-availability";

// Host "open dates" action (DOK-219). Listings are closed-by-default; this opens
// a span so it becomes bookable, by carving it out of the host blocks that cover
// it. The inverse (close) is POST /api/listings/[id]/blocked-ranges. Owner-only.
//
// The client computes the span for its quick actions — "open this month",
// "open the whole year", or a custom range — and sends it as [dateFrom, dateTo).

const openSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

export async function POST(req: Request, { params }: RouteContext<"/api/listings/[id]/availability">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;

  const listing = await prisma.listing.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!listing) return notFound("Listing not found");
  if (listing.userId !== session.userId) return forbidden("FORBIDDEN");

  const json = await req.json().catch(() => null);
  const parsed = openSchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid range", { issues: parsed.error.issues });
  if (parsed.data.dateTo <= parsed.data.dateFrom) {
    return invalidInput("End date must be after start.");
  }

  await prisma.$transaction(
    (tx) => openDateRange(tx, id, { dateFrom: parsed.data.dateFrom, dateTo: parsed.data.dateTo }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return NextResponse.json({ ok: true });
}
