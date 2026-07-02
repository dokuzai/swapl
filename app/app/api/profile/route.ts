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
    // Profile picture URL (DOK-216). Uploaded via /api/uploads/listing-photo,
    // then the returned URL is saved here. Nullable so it can be cleared.
    avatar: z.string().url().max(1000).nullable(),
    bio: z.string().trim().max(1000).nullable(),
    work: z.string().trim().max(120).nullable(),
    languages: z.array(z.string().trim().min(1).max(40)).max(10),
    homeCity: z.string().trim().max(80).nullable(),
    homeCountry: z.string().trim().max(80).nullable(),
    // Date of birth (DOK-219). Calendar date only, as "YYYY-MM-DD". Stored at
    // UTC midnight. Bounded to a plausible, of-age range; null clears it.
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => isValidDob(s), "Invalid date of birth")
      .nullable(),
    // Off-platform contact channels (DOK-204). Full-replace: the editor sends
    // the complete desired set; invalid/empty values are dropped server-side.
    contactChannels: contactChannelsInputSchema,
  })
  .partial();

// Accept only real calendar dates for an of-age member (13–120). Parsed in UTC
// so the stored midnight matches the date the user picked, regardless of TZ.
function isValidDob(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return false; // e.g. 2021-02-30 rolled over
  }
  const now = new Date();
  const age = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 13 && age <= 120;
}

export async function PATCH(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const { name, avatar, bio, work, languages, homeCity, homeCountry, dateOfBirth, contactChannels } = parsed.data;
  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar: avatar || null } : {}),
      ...(bio !== undefined ? { bio: bio || null } : {}),
      ...(work !== undefined ? { work: work || null } : {}),
      ...(languages !== undefined ? { languages: stringifyJSON(languages) } : {}),
      ...(homeCity !== undefined ? { homeCity: homeCity || null } : {}),
      ...(homeCountry !== undefined ? { homeCountry: homeCountry || null } : {}),
      ...(dateOfBirth !== undefined
        ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null }
        : {}),
      ...(contactChannels !== undefined ? { contactChannels: serializeContactChannels(contactChannels) } : {}),
    },
    select: {
      avatar: true,
      work: true,
      languages: true,
      homeCity: true,
      homeCountry: true,
      dateOfBirth: true,
      contactChannels: true,
    },
  });

  return NextResponse.json({
    profile: {
      avatar: user.avatar,
      work: user.work,
      languages: parseJSON<string[]>(user.languages, []),
      homeCity: user.homeCity,
      homeCountry: user.homeCountry,
      // ISO calendar date (YYYY-MM-DD) or null — matches the editor's wire shape.
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
      contactChannels: ownContactChannels(user.contactChannels),
    },
  });
}
