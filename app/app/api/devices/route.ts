// Mobile device registration. The app calls this on first launch (after sign-in
// permission) and on push-token rotation. Idempotent on (userId, pushToken).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { deviceRegisterSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deviceRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { platform, pushToken, locale, appVersion } = parsed.data;
  const device = await prisma.device.upsert({
    where: { userId_pushToken: { userId: session.userId, pushToken } },
    create: { userId: session.userId, platform, pushToken, locale, appVersion },
    update: { platform, locale, appVersion },
  });
  return NextResponse.json({ ok: true, deviceId: device.id });
}

// Unregister all devices for the calling user (called on logout).
export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const url = new URL(req.url);
  const pushToken = url.searchParams.get("pushToken");
  if (pushToken) {
    await prisma.device.deleteMany({ where: { userId: session.userId, pushToken } });
  } else {
    await prisma.device.deleteMany({ where: { userId: session.userId } });
  }
  return NextResponse.json({ ok: true });
}
