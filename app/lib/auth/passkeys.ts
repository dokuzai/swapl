// WebAuthn passkeys — shared helpers for the /api/auth/passkey/* routes.
//
// The relying party is derived from NEXT_PUBLIC_APP_URL (prod
// https://app.swapl.fun) and falls back to localhost in dev, so passkeys
// work out of the box on `next dev` without any configuration. WebAuthn
// needs no external credentials, hence — unlike the OAuth providers — the
// feature is always on.
//
// Challenges are stored server-side (WebAuthnChallenge), live 5 minutes and
// are consume-and-delete: a replayed response finds no challenge row and
// fails. Login is usernameless (discoverable credentials): the challenge row
// carries no userId and the posted assertion's credential id resolves the
// account.

import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type RelyingParty = {
  rpID: string;
  rpName: string;
  /**
   * Origins a client may report in clientDataJSON: the web origin from
   * NEXT_PUBLIC_APP_URL plus one "android:apk-key-hash:<base64url(sha256)>"
   * origin per signing cert published in .well-known/assetlinks.json (Android
   * Credential Manager reports the app's signing-key hash, not an https
   * origin). simplewebauthn accepts string | string[] for expectedOrigin.
   */
  expectedOrigin: string[];
};

let cachedAndroidOrigins: string[] | null = null;

/**
 * "android:apk-key-hash:…" origins derived from the sha256_cert_fingerprints
 * in public/.well-known/assetlinks.json — the fingerprint IS the sha256 of
 * the signing cert, so the apk-key-hash is just its bytes re-encoded as
 * base64url. Missing/malformed file degrades to [] (web-only origins).
 */
export function androidAppOrigins(): string[] {
  if (cachedAndroidOrigins) return cachedAndroidOrigins;
  const origins = new Set<string>();
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "public", ".well-known", "assetlinks.json"),
      "utf8"
    );
    const statements: unknown = JSON.parse(raw);
    if (Array.isArray(statements)) {
      for (const statement of statements) {
        const fingerprints = (statement as { target?: { sha256_cert_fingerprints?: unknown } })
          ?.target?.sha256_cert_fingerprints;
        if (!Array.isArray(fingerprints)) continue;
        for (const fp of fingerprints) {
          if (typeof fp !== "string") continue;
          const hex = fp.replace(/:/g, "");
          if (!/^[0-9A-Fa-f]{64}$/.test(hex)) continue;
          origins.add(`android:apk-key-hash:${Buffer.from(hex, "hex").toString("base64url")}`);
        }
      }
    }
  } catch {
    // No assetlinks.json (or unreadable) — Android origins simply absent.
  }
  cachedAndroidOrigins = [...origins];
  return cachedAndroidOrigins;
}

/** RP identity from NEXT_PUBLIC_APP_URL; localhost fallback for dev. */
export function relyingParty(): RelyingParty {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const url = new URL(raw);
  return {
    rpID: url.hostname, // "app.swapl.fun" in prod, "localhost" in dev
    rpName: "swapl",
    expectedOrigin: [url.origin, ...androidAppOrigins()],
  };
}

export type ChallengeType = "register" | "login";

/** Persist a freshly generated challenge (and sweep expired rows). */
export async function storeChallenge(
  challenge: string,
  type: ChallengeType,
  userId?: string
): Promise<void> {
  // Opportunistic TTL sweep — keeps the table tiny without a cron.
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webAuthnChallenge.create({
    data: {
      challenge,
      type,
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

export type ConsumeOutcome =
  | { ok: true; userId: string | null }
  | { ok: false; reason: "not-found" | "expired" | "wrong-type" };

/**
 * Single-use challenge redemption: the row is DELETED no matter the outcome,
 * so a second verify with the same response can never succeed.
 */
export async function consumeChallenge(
  challenge: string,
  type: ChallengeType
): Promise<ConsumeOutcome> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { challenge } });
  if (!row) return { ok: false, reason: "not-found" };
  await prisma.webAuthnChallenge.delete({ where: { id: row.id } });
  if (row.type !== type) return { ok: false, reason: "wrong-type" };
  if (row.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.userId };
}

/**
 * Pull the challenge string out of a WebAuthn response's clientDataJSON
 * (base64url JSON). The server stored it at options time; this lets verify
 * look the row up without the client echoing the challenge separately.
 */
export function challengeFromClientData(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== "string" || clientDataJSON.length === 0) return null;
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
    return typeof parsed.challenge === "string" && parsed.challenge.length > 0
      ? parsed.challenge
      : null;
  } catch {
    return null;
  }
}

/** Fallback label for a credential whose client sent no name. */
export function defaultCredentialName(deviceType?: string, backedUp?: boolean): string {
  return deviceType === "multiDevice" || backedUp ? "Synced passkey" : "Device passkey";
}

/** JSON-safe summary of a stored credential (BigInt counter stripped). */
export type PasskeySummary = {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export function toPasskeySummary(c: {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}): PasskeySummary {
  return {
    id: c.id,
    name: c.name,
    deviceType: c.deviceType,
    backedUp: c.backedUp,
    createdAt: c.createdAt.toISOString(),
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
  };
}
