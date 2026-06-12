// GET /api/discover/experiences?city={city} — public experience cards via
// the GetYourGuide affiliate (env-gated: no AFF_GETYOURGUIDE_ID → empty
// list). Without `city`, falls back to the top cities by active listings.
// Photos are served from the CityMedia cache only; no prices, ever. Shares
// the per-IP `discover:` rate-limit bucket with /api/discover/services.

import { NextResponse } from "next/server";
import { getDiscoverExperiences } from "@/lib/discover";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

const MIN_MS = 60 * 1000;
const LIMIT_PER_MIN = 60;

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`discover:${ip}`, LIMIT_PER_MIN, MIN_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const city = new URL(req.url).searchParams.get("city")?.trim() || undefined;
  const items = await getDiscoverExperiences(city);
  return NextResponse.json({ items });
}
