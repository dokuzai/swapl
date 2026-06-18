// PATCH /api/profile — update the caller's rich profile fields (DOK-147).
// Partial: only the keys present in the body are touched. All fields are
// nullable so clients can clear them explicitly.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, stringifyJSON, parseJSON } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, unauthenticated } from "@/lib/api/errors";
import { contactChannelsInputSchema, serializeContactChannels, ownContactChannels } from "@/lib/contact-channels";

const schema = z
  .object({
    // Additive (DOK-147 web settings): display name + bio, both optional so
    // older clients that never send them are unaffected.
    name: z.string().trim().min(1).max(80),
    bio: z.string().trim().max(1000).nullable(),
    work: z.string().trim().max(120).nullable(),
    languages: z.array(z.string().trim().min(1).max(40)).max(10),
    homeCity: z.string().trim().max(80).nullable(),
    homeCountry: z.string().trim().max(80).nullable(),
    // Off-platform contact channels (DOK-204). Full-replace: the editor sends
    // the complete desired set; invalid/empty values are dropped server-side.
    contactChannels: contactChannelsInputSchema,
  })
  .partial();

export async function PATCH(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const { name, bio, work, languages, homeCity, homeCountry, contactChannels } = parsed.data;
  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(bio !== undefined ? { bio: bio || null } : {}),
      ...(work !== undefined ? { work: work || null } : {}),
      ...(languages !== undefined ? { languages: stringifyJSON(languages) } : {}),
      ...(homeCity !== undefined ? { homeCity: homeCity || null } : {}),
      ...(homeCountry !== undefined ? { homeCountry: homeCountry || null } : {}),
      ...(contactChannels !== undefined ? { contactChannels: serializeContactChannels(contactChannels) } : {}),
    },
    select: { work: true, languages: true, homeCity: true, homeCountry: true, contactChannels: true },
  });

  return NextResponse.json({
    profile: {
      work: user.work,
      languages: parseJSON<string[]>(user.languages, []),
      homeCity: user.homeCity,
      homeCountry: user.homeCountry,
      contactChannels: ownContactChannels(user.contactChannels),
    },
  });
}
