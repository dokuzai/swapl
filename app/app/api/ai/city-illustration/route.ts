import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { generateCityArt } from "@/lib/ai/city-illustration";
import { checkRateLimit } from "@/lib/rate-limit";
import { findCity } from "@/lib/cities-extended";

const schema = z.object({
  city: z.string().min(1).max(80),
  country: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = checkRateLimit(`ai:city:${session.userId}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Only generate postcards for cities we know about. Free-text city names
  // produced inconsistent results from the AI ("Wakanda → palm + minaret +
  // skyscraper" looked nothing like anywhere real), so the form is now
  // constrained to the EXTENDED_CITIES catalog and the API rejects the rest.
  const known = findCity(parsed.data.city);
  if (!known) {
    return NextResponse.json(
      { error: "We don't have an illustration style for that city yet. Pick from the suggestions or contact us to add it." },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });

  // Always pass the canonical city name + country so the cache key is stable
  // regardless of which alias the user typed.
  const decision = await generateCityArt(known.name, known.country, {
    userOverride: user
      ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
      : undefined,
  });

  return NextResponse.json(decision);
}
