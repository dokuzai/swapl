// Refresh an existing Bearer token. The presented token must still be valid;
// we issue a fresh one and revoke the old. Mobile clients call this when the
// stored expiry is within ~3 days.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest, issueAuthToken, revokeAuthToken } from "@/lib/auth/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return NextResponse.json({ error: "Bearer token required" }, { status: 400 });
  const oldToken = m[1].trim();

  // Carry over platform/appVersion from the old row so we don't lose telemetry.
  const { createHash } = await import("node:crypto");
  const oldHash = createHash("sha256").update(oldToken).digest("hex");
  const old = await prisma.authToken.findUnique({ where: { tokenHash: oldHash } });
  if (!old) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const issued = await issueAuthToken(
    session.userId,
    old.platform as "ios" | "android" | "web-pwa",
    old.appVersion ?? undefined
  );
  await revokeAuthToken(oldToken);

  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
  });
}
