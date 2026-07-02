// POST /api/keys/stays/{id}/review — leave a review after a COMPLETED Keys stay
// (JRN-GP-01). Mirrors the swap review route: gated to the stay's guest/host,
// only once status === "completed", at most one review per author per stay
// (DB-enforced via @@unique([keysStayId, authorId])). The subject is always the
// other party; the review is about the stay's single listing.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { forbidden, invalidInput, notFound, unauthenticated, unprocessable, apiError } from "@/lib/api/errors";
import { grantReviewBonus } from "@/lib/keys/earn";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(20).max(1000),
});

export async function POST(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/review">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // Share the SAME 10/hour budget key as swap reviews so it can't be dodged by
  // mixing endpoints.
  const rl = await checkRateLimitDurable(`review:${session.userId}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return apiError(429, "Rate limited", { resetAt: rl.resetAt });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidInput("Rating must be 1-5 and text 20-1000 characters.", {
      issues: parsed.error.issues,
    });
  }

  const { id } = await params;
  const stay = await prisma.keysStay.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      guestId: true,
      hostId: true,
      listingId: true,
      guest: { select: { email: true } },
      host: { select: { email: true } },
    },
  });
  if (!stay) return notFound("Stay not found");

  const isGuest = stay.guestId === session.userId;
  const isHost = stay.hostId === session.userId;
  if (!isGuest && !isHost) return forbidden("Only the stay parties can review.");
  if (stay.status !== "completed") {
    return unprocessable("Reviews open once the stay is completed.");
  }

  const subjectId = isGuest ? stay.hostId : stay.guestId;

  try {
    const review = await prisma.swapReview.create({
      data: {
        keysStayId: stay.id,
        authorId: session.userId,
        subjectId,
        // A Keys stay has a single home — the review is always about it.
        listingId: stay.listingId,
        rating: parsed.data.rating,
        text: parsed.data.text,
      },
    });

    // Same earning hook as swap reviews — idempotent per reviewId.
    grantReviewBonus({ authorId: session.userId, reviewId: review.id }).catch((err) =>
      console.error("[earn:review]", err)
    );

    // Notify the subject — best effort, never blocks the response.
    const authorName = session.name ?? "Your host";
    const subjectEmail = isGuest ? stay.host.email : stay.guest.email;
    if (subjectEmail) {
      sendEmail(emailTemplates.reviewReceived(subjectEmail, authorName, review.rating), {
        kind: "reviewReceived",
      }).catch((err) => console.error("[review:email]", err));
    }
    sendPush(subjectId, pushTemplates.reviewReceived(authorName, review.rating)).catch((err) =>
      console.error("[review:push]", err)
    );

    return NextResponse.json(
      {
        review: {
          id: review.id,
          keysStayId: review.keysStayId,
          rating: review.rating,
          text: review.text,
          createdAt: review.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    // Unique (keysStayId, authorId) violation — already reviewed.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return apiError(409, "You already reviewed this stay.");
    }
    throw err;
  }
}
