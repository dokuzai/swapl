// GET/PATCH /api/profile/settings — the caller's privacy + notification
// toggles (DOK-147). Stored JSON-encoded in User.settings; a missing column
// means defaults. PATCH is a partial merge — omitted keys keep their value.
//
// Real effects elsewhere:
// - searchEngineIndexing=false → listings dropped from the sitemap and the
//   listing pages get robots noindex (app/sitemap.ts, app/listings/[id]).
// - showHomeCity=false → homeCity/homeCountry omitted from /api/profiles/{id}.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, unauthenticated } from "@/lib/api/errors";
import { mergeSettings, parseSettings, serialiseSettings } from "@/lib/settings";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { settings: true },
  });
  return NextResponse.json({ settings: parseSettings(user?.settings) });
}

const schema = z
  .object({
    searchEngineIndexing: z.boolean(),
    showHomeCity: z.boolean(),
    emailNotifications: z.boolean(),
    pushNotifications: z.boolean(),
  })
  .partial();

export async function PATCH(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { settings: true },
  });
  const next = mergeSettings(parseSettings(user?.settings), parsed.data);
  await prisma.user.update({
    where: { id: session.userId },
    data: { settings: serialiseSettings(next) },
  });
  return NextResponse.json({ settings: next });
}
