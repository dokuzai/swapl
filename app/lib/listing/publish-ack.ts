// Canonical publish acknowledgment text (DOK-162).
//
// FRAMING (plain language, pending a final Italian-lawyer pass before launch):
// the host self-attests they actually have the right to offer the swap in the
// chosen mode. The substance differs by mode:
//   - Hosting with the host present, or letting a room, is everyday hospitality
//     (like relatives staying over): no special permission is needed, even for a
//     tenant. -> "room_or_host_present" (light) variant.
//   - Handing over the *entire home while the host is away* is more: a tenant's
//     lease generally has to allow hosting guests in their absence. An owner is
//     usually free to do so unless building rules say otherwise.
//     -> "entire_home_while_away" variant.
//
// This is a SELF-ATTESTATION we log append-only (ListingPublishAck), never a
// proof check. We never gate publishing on proof of ownership or a landlord's
// permit. Property verification (the "Verified owner" badge) is separate and
// strictly optional.

/** Bump when either variant's wording changes; old acks keep their version. */
export const PUBLISH_ACK_VERSION = "v1" as const;

export const PUBLISH_ACK_MODES = ["entire_home_while_away", "room_or_host_present"] as const;
export type PublishAckMode = (typeof PUBLISH_ACK_MODES)[number];

/** A two-part acknowledgment: a primary line + smaller muted fine print. */
export type PublishAckText = {
  /** Primary self-attestation line, shown prominently. */
  headline: string;
  /** Smaller, muted line clarifying the host's responsibilities. */
  fineprint: string;
};

/**
 * Entire home while the host is away. The primary line covers the right to
 * offer the whole home (and, for renters, that the lease allows hosting).
 */
export const ACK_ENTIRE_HOME: PublishAckText = {
  headline:
    "I have the right to offer my whole home for a swap while I'm away — and if I rent, my lease lets me host guests when I'm not there.",
  fineprint: "I'm responsible for following my lease, building rules, and local laws.",
};

/**
 * A room, or the whole home with the host present — everyday hospitality.
 */
export const ACK_ROOM_OR_HOST: PublishAckText = {
  headline: "I have the right to host this swap.",
  fineprint: "I'll follow my building rules and local laws.",
};

/** Canonical two-part text for a given mode. */
export function ackTextForMode(mode: PublishAckMode): PublishAckText {
  return mode === "entire_home_while_away" ? ACK_ENTIRE_HOME : ACK_ROOM_OR_HOST;
}

/**
 * Flattened single string for the append-only consent log: headline + fine
 * print, so ListingPublishAck.ackText still captures the full statement.
 */
export function ackLogTextForMode(mode: PublishAckMode): string {
  const { headline, fineprint } = ackTextForMode(mode);
  return `${headline} ${fineprint}`;
}

export function isPublishAckMode(value: unknown): value is PublishAckMode {
  return typeof value === "string" && (PUBLISH_ACK_MODES as readonly string[]).includes(value);
}
