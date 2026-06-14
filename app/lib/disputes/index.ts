// Dispute / resolution center shared helpers (DOK-153).
//
// One place for the category vocabulary, the "urgent" set that lights up the
// 24/7 line (safety + access), the allowed status machine, DTO mapping for the
// party-facing timeline, and the admin-inbox fan-out. The route handlers stay
// thin and lean on these so the contract is defined once.

import { prisma } from "@/lib/db";

export const DISPUTE_CATEGORIES = [
  "access",
  "damage",
  "cleanliness",
  "safety",
  "no_show",
  "other",
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

// Categories that should foreground the 24/7 emergency line in clients and
// admin: someone locked out (access) or unsafe (safety) can't wait on a queue.
export const URGENT_CATEGORIES: ReadonlySet<string> = new Set(["safety", "access"]);

export function isUrgentCategory(category: string): boolean {
  return URGENT_CATEGORIES.has(category);
}

export const DISPUTE_STATUSES = [
  "open",
  "investigating",
  "awaiting_response",
  "resolved",
  "closed",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

// Terminal states accept no new messages and can't be re-opened by a party.
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["resolved", "closed"]);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Parse a stored JSON photos column into a string[] without throwing. */
export function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The support/admin inbox that receives a copy of every new dispute. Falls back
 * to the configured support address, then a sane default, so notifications are
 * always best-effort deliverable in dev. We also fan out to every swapl_admin
 * user with an email so on-call admins get a personal ping.
 */
export async function disputeAdminRecipients(): Promise<string[]> {
  const inbox = process.env.DISPUTES_INBOX_EMAIL || process.env.SUPPORT_EMAIL || "support@swapl.com";
  const admins = await prisma.user.findMany({
    where: { role: "swapl_admin" },
    select: { email: true },
  });
  const set = new Set<string>([inbox]);
  for (const a of admins) if (a.email) set.add(a.email);
  return [...set];
}
