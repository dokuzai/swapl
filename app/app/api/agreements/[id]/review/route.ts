// POST /api/agreements/{id}/review — leave a review after a completed swap.
//
// Gating: only the two parties of the agreement, only once the agreement is
// COMPLETED, and at most one review per author per agreement (DB-enforced via
// @@unique([agreementId, authorId])). The subject is always the other party.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { forbidden, invalidInput, notFound, unauthenticated, unprocessable, apiError } from "@/lib/api/errors";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(20).max(1000),
});

export async function POST(req: Request, { params }: RouteContext<"/api/agreements/[id]/review">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // 10 reviews/hour per user — generous for humans, stops scripted spam.
  const rl = await checkRateLimitDurable(`review:${session.userId}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return apiError(429, "Rate limited", { resetAt: rl.resetAt });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidInput("Rating must be 1-5 and text 20-1000 characters.", {
      issues: parsed.error.issues,
    });
  }

  const { id } = await params;
  const agreement = await prisma.swapAgreement.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      listing1: { select: { userId: true } },
      listing2: { select: { userId: true } },
    },
  });
  if (!agreement) return notFound();

  const parties = [agreement.listing1.userId, agreement.listing2.userId];
  if (!parties.includes(session.userId)) return forbidden("Only the swap parties can review.");
  if (agreement.status !== "COMPLETED") {
    return unprocessable("Reviews open once the swap is completed.");
  }

  const subjectId = parties.find((uid) => uid !== session.userId);
  if (!subjectId) return unprocessable("Cannot review your own listing swap.");

  try {
    const review = await prisma.swapReview.create({
      data: {
        agreementId: agreement.id,
        authorId: session.userId,
        subjectId,
        rating: parsed.data.rating,
        text: parsed.data.text,
      },
    });
    return NextResponse.json(
      {
        review: {
          id: review.id,
          agreementId: review.agreementId,
          rating: review.rating,
          text: review.text,
          createdAt: review.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    // Unique (agreementId, authorId) violation — already reviewed.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return apiError(409, "You already reviewed this swap.");
    }
    throw err;
  }
}
