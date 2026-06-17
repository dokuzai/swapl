import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { geoFromHeaders } from "@/lib/geo";
import { recordLocation } from "@/lib/location";

export const dynamic = "force-dynamic";

// POST /api/location/ping — the app calls this ~once a day. With location
// permission it sends a coarse device fix (country/region/city); otherwise it
// sends an empty body and we fall back to the request's geo-IP. Coarse only —
// no exact coordinates are stored.
const schema = z.object({
  countryCode: z.string().length(2).optional(),
  region: z.string().max(64).optional(),
  city: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const body = parsed.success ? parsed.data : {};

  if (body.countryCode) {
    await recordLocation(
      session.userId,
      { countryCode: body.countryCode.toUpperCase(), region: body.region ?? null, city: body.city ?? null },
      "gps",
    );
    return NextResponse.json({ ok: true, source: "gps" });
  }

  // No device fix — derive from the request IP (Vercel geo headers).
  const fix = geoFromHeaders(req);
  if (fix.countryCode) {
    await recordLocation(session.userId, fix, "ip");
    return NextResponse.json({ ok: true, source: "ip" });
  }

  return NextResponse.json({ ok: true, source: "none" });
}
