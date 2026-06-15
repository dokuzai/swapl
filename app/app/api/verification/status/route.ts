// GET /api/verification/status — the signed-in user's identity-check state.
//
// Authenticated. Always answers, even with Didit unconfigured (`enabled`
// tells clients whether to render the verification CTA). When the latest
// attempt is still pending and no webhook secret is configured, we poll
// Didit directly so the status converges without webhooks (dev / preview
// deployments behind no public URL).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import {
  applyVerificationUpdate,
  diditConfig,
  getSessionStatus,
} from "@/lib/verification/didit";
import { refereeRewardFor } from "@/lib/growth/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { enabled, webhookSecret } = diditConfig();

  const [user, latest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { verified: true, verifiedAt: true },
    }),
    prisma.identityVerification.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) return unauthenticated();

  let status = latest?.status ?? (user.verified ? "approved" : "none");
  let verifiedAt = user.verifiedAt;
  let completedAt = latest?.completedAt ?? null;

  // Polling fallback: no webhook configured, so ask Didit ourselves.
  if (enabled && !webhookSecret && latest && latest.status === "pending") {
    try {
      const snapshot = await getSessionStatus(latest.sessionId);
      const applied = await applyVerificationUpdate(latest.sessionId, snapshot.diditStatus, snapshot.raw);
      if (applied) {
        status = applied.status;
        if (applied.changed && applied.status === "approved") {
          const fresh = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { verifiedAt: true },
          });
          verifiedAt = fresh?.verifiedAt ?? new Date();
        }
        if (applied.changed) completedAt = new Date();
      }
    } catch (err) {
      // Best-effort: report the stored state when Didit is unreachable.
      console.error("[verification:status] poll failed", err);
    }
  }

  // Growth (DOK-157): if this now-verified user was referred and the two-sided
  // Keys reward paid out, surface the credited amount + referrer so clients can
  // show a one-time "you earned Keys" toast. Derived from persisted Referral
  // state, so it's correct whether the qualify hook ran via webhook or polling.
  // Best-effort: never let a lookup failure break the status response.
  let referralReward: { keys: number; referrerName: string | null } | null = null;
  if (status === "approved") {
    try {
      const reward = await refereeRewardFor(session.userId);
      if (reward && reward.keys > 0) referralReward = reward;
    } catch (err) {
      console.error("[verification:status] referral reward lookup failed", err);
    }
  }

  return NextResponse.json({
    enabled,
    status,
    verified: user.verified || status === "approved",
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    completedAt: completedAt ? completedAt.toISOString() : null,
    referralReward,
  });
}
