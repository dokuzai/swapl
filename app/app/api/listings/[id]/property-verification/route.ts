// Optional owner-proof verification (DOK-162). The listing owner can attach
// documents (deed, utility bill, etc.) to earn a "Verified owner" badge.
//
// This is NEVER a gate to publishing — a host can list without ever touching
// this endpoint. Submitting (re)opens a pending PropertyVerification for admin
// review; GET returns the current status.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, invalidInput, notFound, unauthenticated } from "@/lib/api/errors";

const documentSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
});

const submitSchema = z.object({
  documents: z.array(documentSchema).min(1).max(10),
});

type VerificationRow = {
  id: string;
  status: string;
  documents: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(v: VerificationRow) {
  let documents: unknown = [];
  try {
    documents = JSON.parse(v.documents);
  } catch {
    documents = [];
  }
  return {
    id: v.id,
    status: v.status,
    documents,
    note: v.note,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/listings/[id]/property-verification">
) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true, ownerVerified: true },
  });
  if (!listing) return notFound();
  if (listing.userId !== session.userId) return forbidden("FORBIDDEN");

  const current = await prisma.propertyVerification.findFirst({
    where: { listingId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    ownerVerified: listing.ownerVerified,
    verification: current ? toDTO(current) : null,
  });
}

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/listings/[id]/property-verification">
) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!listing) return notFound();
  if (listing.userId !== session.userId) return forbidden("FORBIDDEN");

  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidInput("Invalid input", { issues: parsed.error.issues });
  }

  const documents = JSON.stringify(parsed.data.documents);

  // Reopen an existing pending/rejected request rather than piling up rows; a
  // fresh submission always lands back in the review queue as pending.
  const existing = await prisma.propertyVerification.findFirst({
    where: { listingId: id, status: { in: ["pending", "rejected"] } },
    orderBy: { createdAt: "desc" },
  });

  const row = existing
    ? await prisma.propertyVerification.update({
        where: { id: existing.id },
        data: { documents, status: "pending", note: null, reviewedById: null },
      })
    : await prisma.propertyVerification.create({
        data: { listingId: id, userId: session.userId, documents, status: "pending" },
      });

  return NextResponse.json({ verification: toDTO(row) }, { status: 201 });
}
