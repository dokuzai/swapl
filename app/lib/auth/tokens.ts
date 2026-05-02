// One-shot token primitives for email verification + password reset.
// We send the cleartext token in the email URL exactly once; the DB only
// stores SHA-256 hashes so a leaked DB row can't be replayed.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

const VERIFY_TTL_HOURS = 7 * 24;   // 7 days to confirm an email
const RESET_TTL_HOURS = 1;         // 1-hour reset window

export type TokenKind = "verify" | "reset";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueToken(userId: string, kind: TokenKind): Promise<string> {
  // Invalidate any outstanding tokens of the same kind so the latest email
  // wins; users who get two reset emails should be safe to click either,
  // but only the latest works.
  await prisma.emailToken.updateMany({
    where: { userId, kind, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  const raw = generateRawToken();
  const ttlHours = kind === "verify" ? VERIFY_TTL_HOURS : RESET_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await prisma.emailToken.create({
    data: { userId, kind, tokenHash: hashToken(raw), expiresAt },
  });
  return raw;
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not-found" | "expired" | "used" };

// Atomic consume: marks the token used IF it matches a non-expired,
// non-used row. Returns the owning user id on success.
export async function consumeToken(rawToken: string, kind: TokenKind): Promise<ConsumeResult> {
  if (!rawToken || rawToken.length < 16) return { ok: false, reason: "not-found" };
  const tokenHash = hashToken(rawToken);
  const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
  if (!row || row.kind !== kind) return { ok: false, reason: "not-found" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  await prisma.emailToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });
  return { ok: true, userId: row.userId };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
