// Canonical publish acknowledgment text (DOK-162).
//
// LEGAL FRAMING (do not soften): the line that matters is NOT money, it is
// whether the host *cedes enjoyment of the home to a third party*.
//   - Hosting with the host present, or letting a room, is plain hospitality
//     (like relatives staying over): no permission is ever required, even for a
//     tenant. -> "room_or_host_present" (light) variant.
//   - Handing over the *entire home while the host is away* is a cession of
//     enjoyment: a tenant's lease typically forbids subletting/loan-for-use
//     without the landlord's consent (money or not). An owner is free to do so
//     unless the condominium rules say otherwise. -> "entire_home_while_away"
//     variant, which surfaces the possession-right / landlord-consent attestation.
//
// This is a SELF-ATTESTATION we log append-only (ListingPublishAck), never a
// proof check. We never gate publishing on proof of ownership or a landlord's
// permit. Property verification (the "Verified owner" badge) is separate and
// strictly optional.

/** Bump when either variant's wording changes; old acks keep their version. */
export const PUBLISH_ACK_VERSION = "v1" as const;

export const PUBLISH_ACK_MODES = ["entire_home_while_away", "room_or_host_present"] as const;
export type PublishAckMode = (typeof PUBLISH_ACK_MODES)[number];

/**
 * Entire home while the host is away — cession of enjoyment. Surfaces the
 * possession-right / landlord-consent attestation a tenant needs.
 */
export const ACK_ENTIRE_HOME =
  "I confirm I have the right to offer this entire home for a swap while I'm away. " +
  "If I rent it, I have my landlord's consent to host guests in my absence as my lease " +
  "requires, and I comply with any condominium or building rules. I understand swapl " +
  "does not verify this and that I alone am responsible for having the right to host.";

/**
 * A room, or the whole home with the host present — plain hospitality. No
 * permission needed; the lighter attestation reflects that.
 */
export const ACK_ROOM_OR_HOST =
  "I confirm I'm offering hospitality in a home I live in — a room, or my home while " +
  "I'm present as host. I'll respect any condominium or building rules and I'm " +
  "responsible for the stay I host.";

/** Canonical text for a given mode. */
export function ackTextForMode(mode: PublishAckMode): string {
  return mode === "entire_home_while_away" ? ACK_ENTIRE_HOME : ACK_ROOM_OR_HOST;
}

export function isPublishAckMode(value: unknown): value is PublishAckMode {
  return typeof value === "string" && (PUBLISH_ACK_MODES as readonly string[]).includes(value);
}
