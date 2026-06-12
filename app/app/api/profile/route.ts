// PATCH /api/profile — update the caller's rich profile fields (DOK-147).
// Partial: only the keys present in the body are touched. All fields are
// nullable so clients can clear them explicitly.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, stringifyJSON, parseJSON } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, unauthenticated } from "@/lib/api/errors";

const schema = z
  .object({
    work: z.string().trim().max(120).nullable(),
    languages: z.array(z.string().trim().min(1).max(40)).max(10),
    homeCity: z.string().trim().max(80).nullable(),
    homeCountry: z.string().trim().max(80).nullable(),
  })
  .partial();

export async function PATCH(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const { work, languages, homeCity, homeCountry } = parsed.data;
  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(work !== undefined ? { work: work || null } : {}),
      ...(languages !== undefined ? { languages: stringifyJSON(languages) } : {}),
      ...(homeCity !== undefined ? { homeCity: homeCity || null } : {}),
      ...(homeCountry !== undefined ? { homeCountry: homeCountry || null } : {}),
    },
    select: { work: true, languages: true, homeCity: true, homeCountry: true },
  });

  return NextResponse.json({
    profile: {
      work: user.work,
      languages: parseJSON<string[]>(user.languages, []),
      homeCity: user.homeCity,
      homeCountry: user.homeCountry,
    },
  });
}
