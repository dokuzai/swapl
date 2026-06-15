import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, invalidInput, notFound, rateLimited, unauthenticated } from "@/lib/api/errors";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { normaliseEmail } from "@/lib/auth/tokens";
import { newInviteToken, inviteShareUrl } from "@/lib/growth/referrals";

const bodySchema = z.object({
  // Optional: when present, the invite is email-targeted and auto-links to that
  // person's account on signup. When absent it's a shareable open link.
  email: z.string().email().optional(),
  listingId: z.string().min(1),
});

const HOUR_MS = 60 * 60 * 1000;
const INVITE_RATE_LIMIT = 20; // invites per hour per user (anti-spam)

// POST /api/referrals/invite-to-stay (DOK-157) — issue an invitation tied to
// one of YOUR listings. Returns a shareable link carrying an opaque token; when
// the invitee registers (and later verifies), the resulting Referral has
// source=invite_to_stay and credits Keys to both sides. Earns KEYS, not money.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid invite", { issues: parsed.error.issues });

  const { email, listingId } = parsed.data;

  const rl = await checkRateLimitDurable(`invite-to-stay:${session.userId}`, INVITE_RATE_LIMIT, HOUR_MS);
  if (!rl.ok) return rateLimited();

  // The listing must exist and belong to the caller — you can only invite
  // people to stay at your OWN place.
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true, title: true },
  });
  if (!listing) return notFound("Listing not found");
  if (listing.userId !== session.userId) {
    return forbidden("You can only invite guests to your own listing");
  }

  const refereeEmail = email ? normaliseEmail(email) : null;
  const token = newInviteToken();

  const referral = await prisma.referral.create({
    data: {
      ownerId: session.userId,
      refereeEmail,
      source: "invite_to_stay",
      listingId: listing.id,
      token,
      status: "pending",
    },
    select: { id: true, token: true },
  });

  return NextResponse.json({
    ok: true,
    referralId: referral.id,
    token: referral.token,
    shareUrl: inviteShareUrl(referral.token!),
    listing: { id: listing.id, title: listing.title },
  });
}
