// Off-platform contact channels for a member's profile (DOK-204/205).
//
// Stored on User.contactChannels as JSON-encoded TEXT (dual-schema rule: the
// column is `String?` in BOTH prisma schemas). Channels are member-entered and
// optional. Privacy: they are revealed to a counterparty ONLY once a swap is
// ACCEPTED — the same gating philosophy as exact listing coordinates
// (lib/listing-utils.ts `includeExactCoords`). `publicContactChannels` defaults
// to locked, so any new call site is privacy-safe unless it explicitly opts in.

import { z } from "zod";
import { parseJSON, stringifyJSON } from "@/lib/db";

export const CONTACT_CHANNEL_KEYS = [
  "email",
  "phone",
  "whatsapp",
  "telegram",
  "instagram",
  "discord",
  "website",
] as const;

export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number];
export type ContactChannels = Partial<Record<ContactChannelKey, string>>;

// Lenient input: every channel optional + nullable so a client can set or clear
// any subset. Length-bounded here; per-channel format/normalization is applied
// by `normalizeContactChannels` (invalid values are dropped, not rejected, so a
// typo in one channel never blocks saving the rest).
export const contactChannelsInputSchema = z
  .object({
    email: z.string().trim().max(254).nullable(),
    phone: z.string().trim().max(40).nullable(),
    whatsapp: z.string().trim().max(40).nullable(),
    telegram: z.string().trim().max(80).nullable(),
    instagram: z.string().trim().max(80).nullable(),
    discord: z.string().trim().max(80).nullable(),
    website: z.string().trim().max(200).nullable(),
  })
  .partial();

export type ContactChannelsInput = z.infer<typeof contactChannelsInputSchema>;

// ---- per-channel normalization ----

function cleanEmail(v: string): string | null {
  const s = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

function cleanPhone(v: string): string | null {
  // Keep a leading +, drop everything else that isn't a digit.
  const plus = v.trim().startsWith("+") ? "+" : "";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 15) return null;
  return `${plus}${digits}`;
}

// Strip url/scheme/host prefixes and a leading @, leaving a bare handle, then
// require it to match a per-platform character whitelist. The whitelist is the
// security boundary: it drops anything that could become stored-XSS or link
// injection once a client renders the handle as a link or text (e.g.
// "<img onerror=…>", 'javascript:…', or a quote-breakout).
function cleanHandle(v: string, valid: RegExp, hostPattern?: string): string | null {
  let s = v.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (hostPattern) s = s.replace(new RegExp(`^${hostPattern}/`, "i"), "");
  s = s.replace(/^@/, "").replace(/\/+$/, "").trim();
  return valid.test(s) ? s : null;
}

// Per-platform handle whitelists.
const TELEGRAM_HANDLE = /^[a-zA-Z0-9_]{1,32}$/;
const INSTAGRAM_HANDLE = /^[a-zA-Z0-9._]{1,30}$/;
// Discord new-style username, or the legacy name#1234 form.
const DISCORD_HANDLE = /^[a-zA-Z0-9._]{2,32}(#[0-9]{4})?$/;

function cleanWebsite(v: string): string | null {
  let s = v.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Clean a raw channels object: normalize each value and drop anything empty or
 * invalid. The result only contains channels with usable values.
 */
export function normalizeContactChannels(
  input: Partial<Record<ContactChannelKey, string | null | undefined>>,
): ContactChannels {
  const out: ContactChannels = {};
  const apply = (key: ContactChannelKey, fn: (s: string) => string | null) => {
    const raw = input[key];
    if (raw == null) return;
    const cleaned = fn(raw);
    if (cleaned) out[key] = cleaned;
  };
  apply("email", cleanEmail);
  apply("phone", cleanPhone);
  apply("whatsapp", cleanPhone);
  apply("telegram", (s) => cleanHandle(s, TELEGRAM_HANDLE, "t\\.me"));
  apply("instagram", (s) => cleanHandle(s, INSTAGRAM_HANDLE, "instagram\\.com"));
  apply("discord", (s) => cleanHandle(s, DISCORD_HANDLE));
  apply("website", cleanWebsite);
  return out;
}

/**
 * Serialize a (full) channels input for storage. Full-replace semantics: the
 * editor sends the complete desired set each save. Returns null when nothing
 * usable remains, so the column clears rather than storing "{}".
 */
export function serializeContactChannels(input: ContactChannelsInput): string | null {
  const cleaned = normalizeContactChannels(input);
  return Object.keys(cleaned).length ? stringifyJSON(cleaned) : null;
}

/** The caller's own channels (always visible to themselves), normalized. */
export function ownContactChannels(raw: string | null | undefined): ContactChannels {
  return normalizeContactChannels(parseJSON<ContactChannels>(raw, {}));
}

/**
 * Channels as seen by another member. Locked by default — returns null unless
 * `unlocked` is true (i.e. the viewer has an accepted swap with the owner).
 */
export function publicContactChannels(
  raw: string | null | undefined,
  opts: { unlocked: boolean },
): ContactChannels | null {
  if (!opts.unlocked) return null;
  const cleaned = ownContactChannels(raw);
  return Object.keys(cleaned).length ? cleaned : null;
}
