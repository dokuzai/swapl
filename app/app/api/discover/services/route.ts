// GET /api/discover/services — public travel-services catalogue: configured
// affiliate partners (env-gated, links via /api/affiliate/{partner}) plus
// active concierge add-ons with their real DB prices. No auth — it's a
// catalogue — but a mild per-IP rate limit keeps scrapers polite.

import { NextResponse } from "next/server";
import { getDiscoverServices } from "@/lib/discover";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

const MIN_MS = 60 * 1000;
const LIMIT_PER_MIN = 60;

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`discover:${ip}`, LIMIT_PER_MIN, MIN_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const items = await getDiscoverServices();
  return NextResponse.json({ items });
}
