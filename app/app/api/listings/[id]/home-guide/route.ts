// Home guide ("Guida di casa") for a listing (DOK-152).
//
// GET:  the owner always reads their own guide. A non-owner reads it ONLY when
//       an ACTIVE SwapAgreement ties their listing to this one AND the reveal
//       gate is open (48h before the stay, or both guides complete). Otherwise
//       the response is { locked: true, unlocksAt } with NO guide content —
//       reveal gating is strictly server-side.
// PUT:  owner-only partial upsert of the guide fields.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, invalidInput, unauthenticated } from "@/lib/api/errors";
import { guideUnlocked, homeGuideComplete, homeGuideCompleteness } from "@/lib/trip/phase";

const GUIDE_FIELDS = [
  "accessInstructions",
  "keyPickup",
  "wifiName",
  "wifiPassword",
  "heatingCooling",
  "kitchen",
  "bins",
  "petsPlants",
  "houseRules",
  "neighbourhood",
  "emergencyContact",
] as const;

type GuideRow = Record<(typeof GUIDE_FIELDS)[number], string | null> & { updatedAt: Date };

const fieldSchema = z.string().max(4000).nullable().optional();
const putSchema = z.object(
  Object.fromEntries(GUIDE_FIELDS.map((f) => [f, fieldSchema])) as Record<
    (typeof GUIDE_FIELDS)[number],
    typeof fieldSchema
  >,
);

function serialize(guide: GuideRow | null) {
  if (!guide) return null;
  const out: Record<string, string | null> = {};
  for (const f of GUIDE_FIELDS) out[f] = guide[f] ?? null;
  return {
    ...out,
    updatedAt: guide.updatedAt.toISOString(),
    completeness: homeGuideCompleteness(guide),
    complete: homeGuideComplete(guide),
  };
}

export async function GET(req: Request, { params }: RouteContext<"/api/listings/[id]/home-guide">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true, homeGuide: true },
  });
  if (!listing) return notFound();

  // Owner: always full read/write access to their own guide.
  if (listing.userId === session.userId) {
    return NextResponse.json({
      guide: serialize(listing.homeGuide as GuideRow | null),
      isOwner: true,
      locked: false,
    });
  }

  // Non-owner: must be the counterparty of an ACTIVE swap involving this
  // listing, and the reveal gate must be open. We never leak the guide content
  // before the gate — only { locked, unlocksAt }.
  const agreement = await prisma.swapAgreement.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { listing1Id: id, listing2: { userId: session.userId } },
        { listing2Id: id, listing1: { userId: session.userId } },
      ],
    },
    select: {
      dateFrom: true,
      status: true,
      listing1: { select: { homeGuide: true } },
      listing2: { select: { homeGuide: true } },
    },
  });
  if (!agreement) return forbidden();

  const bothComplete =
    homeGuideComplete(agreement.listing1.homeGuide) &&
    homeGuideComplete(agreement.listing2.homeGuide);
  const now = new Date();
  if (!guideUnlocked(agreement, now, bothComplete)) {
    return NextResponse.json({
      guide: null,
      isOwner: false,
      locked: true,
      unlocksAt: new Date(agreement.dateFrom.getTime() - 48 * 60 * 60 * 1000).toISOString(),
    });
  }

  return NextResponse.json({
    guide: serialize(listing.homeGuide as GuideRow | null),
    isOwner: false,
    locked: false,
  });
}

export async function PUT(req: Request, { params }: RouteContext<"/api/listings/[id]/home-guide">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!listing) return notFound();
  if (listing.userId !== session.userId) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  // Partial upsert: only the provided keys are written (undefined keys are left
  // untouched; explicit null clears a field).
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const guide = await prisma.listingHomeGuide.upsert({
    where: { listingId: id },
    create: { listingId: id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, guide: serialize(guide as GuideRow) });
}
