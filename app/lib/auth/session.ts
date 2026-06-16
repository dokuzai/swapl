// Lightweight signed-cookie session for the demo. Designed so NextAuth can replace it later.
// Production note: switch to iron-session or NextAuth before launch.
//
// Mobile clients (iOS, Android) authenticate via an opaque bearer token issued
// by `/api/auth/token` and stored hashed in the AuthToken table. The token
// arrives in the `Authorization: Bearer <token>` header. Web continues to use
// the signed cookie unchanged. `getSessionFromRequest()` accepts either.

import { cookies } from "next/headers";
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { touchLastActive } from "@/lib/auth/activity";

const COOKIE_NAME = "swapl_session";
const TOKEN_TTL_DAYS = 30;
const SESSION_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

// Resolve the HMAC signing key. SECURITY: fail closed in production — never sign
// or verify a session with a weak/empty/known key (that would make cookies
// forgeable → account/admin takeover). The dev fallback is only used outside
// production and only when no strong secret is configured.
const DEV_FALLBACK_SECRET = "dev-secret-please-change-this-to-32-random-bytes-minimum";
let warnedWeakSecret = false;
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to a strong value (>= 32 chars) in production");
  }
  if (!warnedWeakSecret) {
    console.warn("[session] SESSION_SECRET missing or too short — using an INSECURE dev fallback. Never deploy this.");
    warnedWeakSecret = true;
  }
  return DEV_FALLBACK_SECRET;
}

export type SessionPayload = {
  userId: string;
  email: string;
  name: string | null;
};

// What is actually serialised into the cookie — the public payload plus a
// signed expiry so a leaked/forged cookie can't be valid forever.
type SessionBody = SessionPayload & { exp?: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = b64url(
    JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_MS } satisfies SessionBody),
  );
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decode(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionBody;
    // Reject expired cookies. Legacy cookies without `exp` are grandfathered
    // (treated as non-expiring) so this change doesn't log everyone out.
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;
    return { userId: parsed.userId, email: parsed.email, name: parsed.name };
  } catch {
    return null;
  }
}

// ---------- cookie session (web) ----------

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const session = decode(c.get(COOKIE_NAME)?.value);
  // Fire-and-forget activity tracking; throttled internally, never throws.
  if (session) touchLastActive(session.userId);
  return session;
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export async function setSession(p: SessionPayload): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, encode(p), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * TOKEN_TTL_DAYS,
  });
}

export async function clearSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

// ---------- bearer token session (mobile) ----------

export type IssuedToken = {
  token: string;       // raw, returned to the client once
  expiresAt: Date;
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueAuthToken(
  userId: string,
  platform: "ios" | "android" | "web-pwa",
  appVersion?: string
): Promise<IssuedToken> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authToken.create({
    data: { userId, tokenHash, platform, appVersion, expiresAt },
  });
  return { token: raw, expiresAt };
}

export async function revokeAuthToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.authToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getSessionFromBearer(headerValue: string | null): Promise<SessionPayload | null> {
  if (!headerValue) return null;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const row = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  // Sliding window: bump lastSeenAt but skip if recent to avoid write amplification.
  const ageMs = Date.now() - row.lastSeenAt.getTime();
  if (ageMs > 60 * 1000) {
    await prisma.authToken
      .update({ where: { tokenHash }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  // Fire-and-forget activity tracking; throttled internally, never throws.
  touchLastActive(row.user.id);
  return { userId: row.user.id, email: row.user.email, name: row.user.name };
}

// Universal session reader for route handlers: prefer bearer, fall back to
// cookie. Use this in every JSON API endpoint that mobile clients call.
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const bearer = await getSessionFromBearer(auth);
  if (bearer) return bearer;
  return getSession();
}

export async function requireSessionFromRequest(req: Request): Promise<SessionPayload> {
  const s = await getSessionFromRequest(req);
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}
