import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listingCreateSchema } from "@/lib/validators";
import { getSessionFromRequest } from "@/lib/auth/session";
import { generateCityArt } from "@/lib/ai/city-illustration";
import { coordForCity, jitterCoord } from "@/lib/city-coords";
import { ensureCanCreateListing, PlanLimitError } from "@/lib/billing/limits";
import { parseFiltersFromSearchParams } from "@/lib/listing-filters";
import { queryListings, getViewerListing } from "@/lib/listing-query";
import { apiError, forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";
import { nightlyKeysFor } from "@/lib/keys/value";

// Mobile / SPA-friendly listing search. Mirrors what the /listings RSC page
// does today, returning pre-scored results so clients don't recompute.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const filters = parseFiltersFromSearchParams(sp);

  // Match scoring needs the viewer's own listing; use either auth mode.
  const session = await getSessionFromRequest(req);
  const viewer = session ? await getViewerListing(session.userId) : null;

  const result = await queryListings(filters, viewer);
  return NextResponse.json({
    items: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    viewerListingId: viewer?.id ?? null,
  });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // Look up the calling user once: gate publishing on a verified email, and
  // reuse their AI provider prefs for the city-art generation below.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { emailVerifiedAt: true, aiProvider: true, aiModel: true, aiApiKey: true },
  });
  if (!user) return notFound("User not found");
  if (!user.emailVerifiedAt) {
    return forbidden("EMAIL_NOT_VERIFIED", {
      message: "Verify your email before publishing a listing.",
    });
  }

  try {
    await ensureCanCreateListing(session.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return apiError(402, err.reason, { upgradeTo: err.upgradeTo, currentPlan: err.currentPlan });
    }
    throw err;
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

  // AI city-art uses the caller's preferred provider/key (looked up above).
  const userOverride = { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey };
  const art = await generateCityArt(data.city, data.country, { userOverride });

  // Geocode if coords weren't supplied — known cities have a centroid table,
  // jittered per-listing so multiple homes don't stack on one pin.
  let lat = data.lat ?? null;
  let lng = data.lng ?? null;
  if (lat == null || lng == null) {
    const base = coordForCity(data.city);
    if (base) {
      const c = jitterCoord(base, `${session.userId}:${data.city}:${data.title}`);
      lat = c.lat;
      lng = c.lng;
    }
  }

  const created = await prisma.listing.create({
    data: {
      userId: session.userId,
      title: data.title,
      description: data.description,
      propertyType: data.propertyType,
      city: data.city,
      neighbourhood: data.neighbourhood,
      country: data.country,
      address: data.address,
      lat,
      lng,
      sizeSqm: data.sizeSqm,
      // Keys economy (DOK-155): cache the derived value-per-night so reads
      // don't recompute it. A new listing is never verified yet.
      nightlyKeys: nightlyKeysFor({ sizeSqm: data.sizeSqm, sleeps: data.sleeps, city: data.city, isVerified: false }),
      sleeps: data.sleeps,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      floor: data.floor,
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
      paletteHint: art.palette,
      motifHint: art.motif.join(",") || null,
      postcard: JSON.stringify(art.postcard),
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
