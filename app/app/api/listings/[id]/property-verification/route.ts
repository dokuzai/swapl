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
import { classifyPropertyDocument } from "@/lib/ai/property-doc";
import {
  decideVerificationOutcome,
  BUSINESS_INELIGIBLE_REASON,
} from "@/lib/listing/property-eligibility";
import { grantPropertyVerifiedBonus, maybeGrantListingCompleteBonus } from "@/lib/keys/earn";

const documentSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
});

const submitSchema = z.object({
  documents: z.array(documentSchema).min(1).max(10),
  documentType: z.enum(["deed", "lease", "other"]).optional(),
});

type VerificationRow = {
  id: string;
  status: string;
  documents: string;
  note: string | null;
  aiClassification: string | null;
  aiConfidence: number | null;
  aiReasons: string | null;
  aiEntityType: string | null;
  documentType: string | null;
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
  let aiReasons: string[] = [];
  try {
    const parsed = v.aiReasons ? JSON.parse(v.aiReasons) : [];
    if (Array.isArray(parsed)) aiReasons = parsed.filter((r): r is string => typeof r === "string");
  } catch {
    aiReasons = [];
  }
  return {
    id: v.id,
    status: v.status,
    documents,
    note: v.note,
    aiClassification: v.aiClassification,
    aiConfidence: v.aiConfidence,
    aiReasons,
    aiEntityType: v.aiEntityType,
    documentType: v.documentType,
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
    select: {
      id: true,
      userId: true,
      title: true,
      city: true,
      country: true,
      user: { select: { name: true } },
    },
  });
  if (!listing) return notFound();
  if (listing.userId !== session.userId) return forbidden("FORBIDDEN");

  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidInput("Invalid input", { issues: parsed.error.issues });
  }

  const documents = JSON.stringify(parsed.data.documents);
  const documentType = parsed.data.documentType ?? null;

  // AI property-document analysis (DOK-186). Best-effort + env-gated: when the AI
  // is unconfigured / not vision-capable / fails, this returns { aiDisabled } and
  // the outcome is plain "pending" → DOK-162 manual review. The AI only PROPOSES.
  // PRIVACY: we persist ONLY classification + entityType + bounded reasons; the
  // titleholder name is used for context but not stored as extra PII.
  const ai = await classifyPropertyDocument({
    documentUrls: parsed.data.documents.map((d) => d.url),
    documentType: parsed.data.documentType,
    listingContext: {
      title: listing.title,
      city: listing.city,
      country: listing.country,
      hostName: listing.user?.name ?? undefined,
    },
  });
  const outcome = decideVerificationOutcome(ai);

  const aiData = {
    aiClassification: ai.aiDisabled ? null : ai.classification,
    aiConfidence: ai.aiDisabled ? null : ai.confidence,
    aiReasons: ai.aiDisabled ? null : JSON.stringify(ai.reasons),
    aiEntityType: ai.aiDisabled ? null : ai.entityType,
    documentType,
  };

  // Reopen an existing pending/rejected request rather than piling up rows; a
  // fresh submission re-runs the AI and lands at the AI-proposed status.
  const existing = await prisma.propertyVerification.findFirst({
    where: { listingId: id, status: { in: ["pending", "rejected"] } },
    orderBy: { createdAt: "desc" },
  });

  const row = existing
    ? await prisma.propertyVerification.update({
        where: { id: existing.id },
        data: {
          documents,
          status: outcome.status,
          note: null,
          reviewedById: null,
          ...aiData,
        },
      })
    : await prisma.propertyVerification.create({
        data: {
          listingId: id,
          userId: session.userId,
          documents,
          status: outcome.status,
          ...aiData,
        },
      });

  // Side effects on the listing follow the policy: confident business → flag
  // ineligible (excluded from feeds until an admin reverses); high-confidence
  // owner under the auto-approve flag → ownerVerified. Best-effort: never delete
  // host data; the admin override path can always reverse either.
  if (outcome.markIneligible) {
    await prisma.listing.update({
      where: { id },
      data: { ineligibleReason: BUSINESS_INELIGIBLE_REASON, ineligibleAt: new Date() },
    });
  } else if (outcome.setOwnerVerified) {
    await prisma.listing.update({ where: { id }, data: { ownerVerified: true } });
  }

  // DOK-164 earning hook: a verification that AUTO-APPROVES (private_owner or
  // private_tenant under the auto-approve flag) is a real "property verified"
  // event → credit the host once. Best-effort, gated/idempotent/capped inside
  // the hook. The manual admin-approve path credits separately. Re-check the
  // listing-complete milestone since ownerVerified may have just flipped.
  if (outcome.status === "approved") {
    grantPropertyVerifiedBonus({ userId: session.userId, listingId: id }).catch((err) =>
      console.error("[earn:property-verified]", err)
    );
    maybeGrantListingCompleteBonus(id).catch((err) =>
      console.error("[earn:listing-complete]", err)
    );
  }

  return NextResponse.json({ verification: toDTO(row) }, { status: 201 });
}
