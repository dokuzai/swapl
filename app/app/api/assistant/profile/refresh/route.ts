// POST /api/assistant/profile/refresh — force a rebuild of the AI travel
// profile from the latest in-app signals. Rate-limited 5/h per user (the
// AI synthesis is the expensive part).

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { buildTravelProfile } from "@/lib/ai/travel-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, serverError, unauthenticated } from "@/lib/api/errors";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const rl = checkRateLimit(`assistant:profile:refresh:${session.userId}`, 5, HOUR_MS);
  if (!rl.ok) return apiError(429, "Profile refreshed too often — try again later.");

  const built = await buildTravelProfile(session.userId);
  if (!built) return serverError();
  return NextResponse.json(built);
}
