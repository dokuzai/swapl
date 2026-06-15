import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { availabilityFor } from "@/lib/listing/availability";

// GET /api/listings/{id}/calendar — the listing's published availability window
// and every occupied/blocked range, for the date-picker. Public (anyone viewing
// the listing can see which dates are taken); the source of each booked range is
// labelled so clients can colour agreements vs Keys stays vs host blocks.
export async function GET(_req: Request, { params }: RouteContext<"/api/listings/[id]/calendar">) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, isActive: true, availableFrom: true, availableTo: true, minStayDays: true, maxStayDays: true },
  });
  if (!listing || !listing.isActive) return notFound("Listing not found");

  const result = await availabilityFor(listing);
  return NextResponse.json(result);
}
