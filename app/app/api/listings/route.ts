import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listingCreateSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth/session";
import { generateCityArt } from "@/lib/ai/city-illustration";
import { coordForCity, jitterCoord } from "@/lib/city-coords";
import { ensureCanCreateListing, PlanLimitError } from "@/lib/billing/limits";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    await ensureCanCreateListing(session.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return NextResponse.json(
        { error: err.reason, upgradeTo: err.upgradeTo, currentPlan: err.currentPlan },
        { status: 402 }
      );
    }
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  if (data.availableTo <= data.availableFrom) {
    return NextResponse.json({ error: "End date must be after start." }, { status: 400 });
  }

  // Look up the calling user so AI calls can use their preferred provider/key.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });
  const userOverride = user
    ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
    : undefined;
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
