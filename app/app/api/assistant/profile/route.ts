// GET    /api/assistant/profile — the caller's AI travel profile (built on
//        first read so the surface is always answerable).
// DELETE /api/assistant/profile — transparency: the user can erase the
//        synthesised profile at any time.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { buildTravelProfile, readTravelProfile } from "@/lib/ai/travel-profile";
import { serverError, unauthenticated } from "@/lib/api/errors";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const existing = await readTravelProfile(session.userId);
  if (existing) return NextResponse.json(existing);

  const built = await buildTravelProfile(session.userId);
  if (!built) return serverError();
  return NextResponse.json(built);
}

export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  await prisma.travelProfile.deleteMany({ where: { userId: session.userId } });
  return NextResponse.json({ ok: true });
}
