// Referrer real-time notifications (DOK-157).
//
// Closes the dopamine loop: the already-open app polls GET for rewarded-but-
// unseen referral credits ("NAME just verified — you earned 20 Keys!") and
// POSTs back the ids it has shown so each credit toasts exactly once. Derived
// purely from persisted Referral state, so it's correct whether the qualify
// hook ran via webhook or polling, and idempotent under concurrent polls.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import {
  pendingReferrerNotifications,
  markReferrerNotificationsSeen,
} from "@/lib/growth/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/referrals/notifications — the caller's unseen referral credits.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const notifications = await pendingReferrerNotifications(session.userId);
  return NextResponse.json({ notifications });
}

// POST /api/referrals/notifications — acknowledge credits the client has shown.
// Body: { ids: string[] }. Scoped to the caller; idempotent. Returns the count
// newly marked seen.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];

  const seen = await markReferrerNotificationsSeen(session.userId, ids);
  return NextResponse.json({ ok: true, seen });
}
