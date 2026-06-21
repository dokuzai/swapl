// Mobile listing detail. Includes a pre-computed match score against the
// viewer's own listing, plus a small slice of host info.
// PUT/PATCH lets the owner edit the listing fields (full create field set).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listingCreateSchema } from "@/lib/validators";
import { generateCityArt } from "@/lib/ai/city-illustration";
import { coordForCity, jitterCoord } from "@/lib/city-coords";
import { nightlyKeysFor, applyAdjustment } from "@/lib/keys/value";
import { toDTO } from "@/lib/listing-utils";
import { computeMatchScore } from "@/lib/match/score";
import { getViewerListing } from "@/lib/listing-query";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

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
    return notFound();
  }

  const session = await getSessionFromRequest(req);
  const isOwner = session?.userId === listing.userId;
  const dto = toDTO(listing, { includeAddress: isOwner, includeValuation: isOwner, includeExactCoords: isOwner });
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

// Owner-only full update. Accepts the same field set as create; regenerates
// the city postcard art (and re-geocodes) only when the city changes.
export async function PUT(req: Request, { params }: RouteContext<"/api/listings/[id]">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) return notFound();
  if (existing.userId !== session.userId) {
    return forbidden("FORBIDDEN");
  }

  const body = await req.json().catch(() => null);
  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput("Invalid input", { issues: parsed.error.issues });
  }
  const data = parsed.data;
  if (data.availableTo <= data.availableFrom) {
    return invalidInput("End date must be after start.");
  }

  const cityChanged = data.city.trim().toLowerCase() !== existing.city.trim().toLowerCase();

  // Postcard art is tied to the city — keep it unless the city changed.
  let art: { palette: string; motif: string[]; postcard: unknown } | null = null;
  if (cityChanged) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { aiProvider: true, aiModel: true, aiApiKey: true },
    });
    const userOverride = user
      ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
      : undefined;
    art = await generateCityArt(data.city, data.country, { userOverride });
  }

  // Coords: explicit values win; otherwise re-geocode when the city moved.
  let lat = data.lat ?? existing.lat;
  let lng = data.lng ?? existing.lng;
  if (data.lat == null && data.lng == null && cityChanged) {
    const base = coordForCity(data.city);
    if (base) {
      const c = jitterCoord(base, `${session.userId}:${data.city}:${data.title}`);
      lat = c.lat;
      lng = c.lng;
    } else {
      lat = null;
      lng = null;
    }
  }

  const editBase = nightlyKeysFor({
    sizeSqm: data.sizeSqm,
    sleeps: data.sleeps,
    city: data.city,
    isVerified: existing.isVerified,
    spaceType: data.spaceType,
    roomsOffered: data.roomsOffered,
    locationTier: existing.locationTier,
  });

  const updated = await prisma.listing.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      propertyType: data.propertyType,
      city: data.city,
      neighbourhood: data.neighbourhood,
      country: data.country,
      address: data.address ?? null,
      lat,
      lng,
      sizeSqm: data.sizeSqm,
      spaceType: data.spaceType,
      roomsOffered: data.roomsOffered ?? null,
      couchsurfingAvailable: data.couchsurfingAvailable,
      // Keys economy (DOK-155/DOK-163): recompute the deterministic BASE since
      // size/sleeps/city/space may have changed; verification status is
      // unchanged here. Preserve the existing location tier + review feedback
      // adjustment so an edit doesn't reset them (the cron refreshes the AI
      // signal + tier later). nightlyKeys reflects base × (1 + adjustment).
      nightlyKeysBase: editBase,
      nightlyKeys: applyAdjustment(editBase, existing.nightlyKeysAdjustment ?? 0),
      sleeps: data.sleeps,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      floor: data.floor ?? null,
      hasElevator: data.hasElevator,
      stepFreeAccess: data.stepFreeAccess,
      petsAllowed: data.petsAllowed,
      petTypes: JSON.stringify(data.petTypes),
      wfhSetup: data.wfhSetup,
      wfhDesks: data.wfhDesks,
      hasParking: data.hasParking,
      bikeIncluded: data.bikeIncluded,
      rooftop: data.rooftop,
      balcony: data.balcony,
      garden: data.garden,
      courtyard: data.courtyard,
      piano: data.piano,
      pool: data.pool,
      gym: data.gym,
      ac: data.ac,
      dishwasher: data.dishwasher,
      washer: data.washer,
      dryer: data.dryer,
      availableFrom: data.availableFrom,
      availableTo: data.availableTo,
      minStayDays: data.minStayDays,
      maxStayDays: data.maxStayDays,
      photos: JSON.stringify(data.photos),
      tags: JSON.stringify(data.tags),
      ...(art
        ? {
            paletteHint: art.palette,
            motifHint: art.motif.join(",") || null,
            postcard: JSON.stringify(art.postcard),
          }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}

// Same semantics as PUT — clients send the full field set either way.
export const PATCH = PUT;
