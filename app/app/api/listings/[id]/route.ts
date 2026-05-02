// Mobile listing detail. Includes a pre-computed match score against the
// viewer's own listing, plus a small slice of host info.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { toDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
import { getViewerListing } from "@/lib/listing-query";

export async function GET(req: Request, { params }: RouteContext<"/api/listings/[id]">) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatar: true,
          bio: true,
          bioVibe: true,
          verified: true,
          createdAt: true,
        },
      },
    },
  });
  if (!listing || !listing.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dto = toDTO(listing);
  const session = await getSessionFromRequest(req);
  const viewer = session ? await getViewerListing(session.userId) : null;
  const matchScore =
    viewer && viewer.id !== dto.id
      ? computeMatchScore(
          {
            sizeSqm: viewer.sizeSqm,
            sleeps: viewer.sleeps,
            availableFrom: new Date(viewer.availableFrom),
            availableTo: new Date(viewer.availableTo),
            petsAllowed: viewer.petsAllowed,
            wfhSetup: viewer.wfhSetup,
            stepFreeAccess: viewer.stepFreeAccess,
            city: viewer.city,
            neighbourhood: viewer.neighbourhood,
          },
          {
            sizeSqm: dto.sizeSqm,
            sleeps: dto.sleeps,
            availableFrom: new Date(dto.availableFrom),
            availableTo: new Date(dto.availableTo),
            petsAllowed: dto.petsAllowed,
            wfhSetup: dto.wfhSetup,
            stepFreeAccess: dto.stepFreeAccess,
            city: dto.city,
            neighbourhood: dto.neighbourhood,
          }
        )
      : null;

  return NextResponse.json({
    listing: dto,
    host: {
      id: listing.user.id,
      name: listing.user.name,
      avatar: listing.user.avatar,
      bio: listing.user.bio,
      bioVibe: listing.user.bioVibe,
      verified: listing.user.verified,
      memberSince: listing.user.createdAt.toISOString(),
    },
    matchScore,
    viewerListingId: viewer?.id ?? null,
  });
}
