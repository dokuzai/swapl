// Shared session emission for every login-style endpoint (password, OAuth,
// OTP). Reuses the EXISTING session primitives — cookie for web, opaque
// bearer for native — and mirrors the exact response shapes of
// POST /api/auth/login (cookie) and POST /api/auth/token (bearer) so clients
// handle every login flavour identically.

import { NextResponse } from "next/server";
import { setSession, issueAuthToken } from "@/lib/auth/session";

export type LoginUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  emailVerifiedAt: Date | null;
};

export type Platform = "ios" | "android" | "web-pwa";

export async function respondWithSession(
  user: LoginUser,
  platform?: Platform,
  appVersion?: string
): Promise<NextResponse> {
  if (platform) {
    // Native: bearer token, same shape as POST /api/auth/token.
    const issued = await issueAuthToken(user.id, platform, appVersion);
    return NextResponse.json({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
    });
  }
  // Web: signed cookie, same shape as POST /api/auth/login.
  await setSession({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({
    ok: true,
    userId: user.id,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
