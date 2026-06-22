// POST /api/verification/session — start (or resume) an identity check.
//
// Authenticated. Env-gated on Didit (503 when unconfigured). Rate limited to
// 3 creations per hour per user — each call can mint a hosted Didit session,
// which costs money. A still-pending session is reused: we re-fetch its
// hosted URL from Didit instead of opening a new one (the rate-limit counter
// is only consumed by this route, so a reuse still counts toward the cap —
// intentional, it also throttles polling abuse via this endpoint).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, apiError, serverError } from "@/lib/api/errors";
import { checkRateLimitDurable, refundRateLimitDurable } from "@/lib/rate-limit";
import {
  applyVerificationUpdate,
  createSession,
  diditEnabled,
  getSessionStatus,
} from "@/lib/verification/didit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  if (!diditEnabled()) {
    return apiError(503, "VERIFICATION_NOT_CONFIGURED", {
      message: "Identity verification is not available yet.",
    });
  }

  const rlKey = `verification:session:${session.userId}`;
  const rlWindowMs = 60 * 60 * 1000;
  const rl = await checkRateLimitDurable(rlKey, 3, rlWindowMs);
  if (!rl.ok) {
    return apiError(429, "RATE_LIMITED", {
      message: "Too many verification attempts. Try again later.",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return unauthenticated();
  if (user.verified) {
    return NextResponse.json({ status: "approved", url: null });
  }

  // Reuse a pending session when Didit still considers it open.
  const pending = await prisma.identityVerification.findFirst({
    where: { userId: session.userId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    try {
      const snapshot = await getSessionStatus(pending.sessionId);
      if (snapshot.status === "pending" && snapshot.url) {
        return NextResponse.json({ status: "pending", url: snapshot.url, reused: true });
      }
      // The provider moved on while we weren't looking — sync our row, then
      // fall through to a fresh session unless it got approved meanwhile.
      const applied = await applyVerificationUpdate(pending.sessionId, snapshot.diditStatus, snapshot.raw);
      if (applied?.status === "approved") {
        return NextResponse.json({ status: "approved", url: null });
      }
    } catch (err) {
      // Didit unreachable / session vanished: open a fresh one below.
      console.error("[verification:session] reuse failed", err);
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const callbackUrl = `${base}/dashboard?verification=done`;
  try {
    const created = await createSession(session.userId, callbackUrl);
    return NextResponse.json({ status: "pending", url: created.url });
  } catch (err) {
    console.error("[verification:session] create failed", err);
    // No session was minted, so don't make this failed attempt count toward the
    // hourly cap — otherwise a provider/config error locks the user out for an
    // hour through no fault of their own.
    await refundRateLimitDurable(rlKey, rlWindowMs);
    return serverError("Could not start verification");
  }
}
