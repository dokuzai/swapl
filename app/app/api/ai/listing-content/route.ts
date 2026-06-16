import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { draftListingCopy } from "@/lib/ai/listing-content";
import { PROPERTY_TYPES } from "@/lib/types";
import { checkRateLimitDurable } from "@/lib/rate-limit";

const schema = z.object({
  city: z.string().min(2),
  neighbourhood: z.string().min(2),
  country: z.string().optional(),
  propertyType: z.enum(PROPERTY_TYPES),
  sizeSqm: z.number().int().min(20).max(800),
  sleeps: z.number().int().min(1).max(20),
  bedrooms: z.number().int().min(0).max(15),
  bathrooms: z.number().int().min(0).max(10),
  floor: z.number().int().optional().nullable(),
  hasElevator: z.boolean().optional(),
  stepFreeAccess: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  petTypes: z.array(z.string()).optional(),
  wfhSetup: z.boolean().optional(),
  wfhDesks: z.number().int().min(0).max(10).optional(),
  amenities: z.array(z.string()).max(20).optional(),
  availableFrom: z.string().optional(),
  availableTo: z.string().optional(),
  hostNotes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  // 20 generations / 10 minutes is plenty for iterating a draft, low enough
  // to stop a runaway loop from a stuck client.
  const rl = await checkRateLimitDurable(`ai:listing:${session.userId}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Slow down — try again in a few minutes." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });

  const draft = await draftListingCopy(parsed.data, {
    userOverride: user
      ? { provider: user.aiProvider, model: user.aiModel, apiKey: user.aiApiKey }
      : undefined,
  });

  return NextResponse.json(draft);
}
