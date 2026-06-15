import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

// Host-managed manual blocks for a listing (DOK-159). The owner blocks dates
// they don't want bookable (renovations, personal use); these subtract from the
// availability window in lib/listing/availability.ts. Owner-only on every verb.

const createSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  note: z.string().max(500).optional(),
});

const deleteSchema = z.object({
  rangeId: z.string().min(1),
});

async function ownedListing(id: string, userId: string) {
  const listing = await prisma.listing.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!listing) return { error: notFound("Listing not found") };
  if (listing.userId !== userId) return { error: forbidden("FORBIDDEN") };
  return { listing };
}

// GET — the listing's host blocks (owner-only; the public surface is the
// /calendar endpoint, which folds blocks into bookedRanges without notes).
export async function GET(req: Request, { params }: RouteContext<"/api/listings/[id]/blocked-ranges">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  const owned = await ownedListing(id, session.userId);
  if ("error" in owned) return owned.error;

  const ranges = await prisma.listingBlockedRange.findMany({
    where: { listingId: id },
    orderBy: { dateFrom: "asc" },
    select: { id: true, dateFrom: true, dateTo: true, note: true, createdAt: true },
  });
  return NextResponse.json({
    ranges: ranges.map((r) => ({
      id: r.id,
      dateFrom: r.dateFrom.toISOString(),
      dateTo: r.dateTo.toISOString(),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// POST — block a date range. Owner-only.
export async function POST(req: Request, { params }: RouteContext<"/api/listings/[id]/blocked-ranges">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  const owned = await ownedListing(id, session.userId);
  if ("error" in owned) return owned.error;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid blocked range", { issues: parsed.error.issues });
  if (parsed.data.dateTo <= parsed.data.dateFrom) {
    return invalidInput("End date must be after start.");
  }

  const created = await prisma.listingBlockedRange.create({
    data: {
      listingId: id,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      note: parsed.data.note ?? null,
    },
  });
  return NextResponse.json({
    ok: true,
    range: {
      id: created.id,
      dateFrom: created.dateFrom.toISOString(),
      dateTo: created.dateTo.toISOString(),
      note: created.note,
      createdAt: created.createdAt.toISOString(),
    },
  });
}

// DELETE — unblock a range by id. Owner-only; the range must belong to this
// listing (guards against deleting another listing's block by id).
export async function DELETE(req: Request, { params }: RouteContext<"/api/listings/[id]/blocked-ranges">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;
  const owned = await ownedListing(id, session.userId);
  if ("error" in owned) return owned.error;

  const json = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid request", { issues: parsed.error.issues });

  const range = await prisma.listingBlockedRange.findUnique({
    where: { id: parsed.data.rangeId },
    select: { id: true, listingId: true },
  });
  if (!range || range.listingId !== id) return notFound("Blocked range not found");

  await prisma.listingBlockedRange.delete({ where: { id: range.id } });
  return NextResponse.json({ ok: true });
}
