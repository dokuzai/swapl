// One-time login codes (email + SMS).
//
// Codes are 6 digits, stored ONLY as a SHA-256 hash, valid 10 minutes, max 5
// verification attempts per code. Requesting a new code invalidates the
// outstanding ones for that destination (latest-wins, like EmailToken).

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChannel = "email" | "sms";

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode(): string {
  // crypto-random, zero-padded to exactly 6 digits.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Normalise a destination: emails lowercased, phones stripped of spaces. */
export function normaliseDestination(channel: OtpChannel, destination: string): string {
  const d = destination.trim();
  return channel === "email" ? d.toLowerCase() : d.replace(/[\s\-()]/g, "");
}

/** Create a fresh OTP for the destination, voiding outstanding ones. */
export async function createOtp(channel: OtpChannel, destination: string): Promise<string> {
  await prisma.loginOtp.updateMany({
    where: { destination, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  const code = generateOtpCode();
  await prisma.loginOtp.create({
    data: {
      destination,
      channel,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return code;
}

export type OtpVerifyOutcome =
  | { ok: true; channel: OtpChannel }
  | { ok: false; reason: "not-found" | "expired" | "too-many-attempts" | "wrong-code" | "used" };

/**
 * Validate a code against the latest outstanding OTP for the destination.
 * Increments `attempts` on every wrong guess; the row dies after
 * OTP_MAX_ATTEMPTS. Consumes the row on success (single use).
 */
export async function verifyOtp(destination: string, code: string): Promise<OtpVerifyOutcome> {
  const row = await prisma.loginOtp.findFirst({
    where: { destination, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (row.expiresAt != null && row.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too-many-attempts" };

  const a = Buffer.from(hashOtpCode(code), "hex");
  const b = Buffer.from(row.codeHash, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    // Atomic increment of attempts; if already at max, another concurrent attempt
    // may have incremented it, but we still report the current state.
    const updated = await prisma.loginOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: "too-many-attempts" };
    }
    return { ok: false, reason: "wrong-code" };
  }
  // Atomic consume: only succeeds if the row is still unconsumed at the moment of update.
  const updated = await prisma.loginOtp.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, reason: "used" };
  return { ok: true, channel: row.channel as OtpChannel };
}
