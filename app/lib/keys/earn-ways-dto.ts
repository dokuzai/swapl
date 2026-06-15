// Client-safe DTO types for the "ways to earn Keys" surface (DOK-164).
//
// No prisma / no server imports — safe to `import type` from "use client"
// components. The server builder lives in @/lib/keys/earn-ways.

/** One row in the "ways to earn Keys" catalogue. */
export type EarnWay = {
  // Stable identifier for the action (drives copy/icon/CTA on the client).
  key:
    | "verify_identity"
    | "verify_property"
    | "complete_listing"
    | "leave_review"
    | "share_converted"
    | "refer_friend";
  // Keys minted by the action (founder-set magnitude).
  amount: number;
  // True when the action can pay out more than once (per review, per listing…).
  repeatable: boolean;
  // True when the bonus requires a verified identity (anti-farm gate).
  gatedOnIdentity: boolean;
  // The ledger kind this action produces (also used to detect `done`).
  kind: string;
  // Whether the user has earned this kind at least once.
  done: boolean;
};

export type EarnWaysPayload = {
  // Whether the caller has a verified identity — gated rows are unavailable
  // until this is true.
  identityVerified: boolean;
  ways: EarnWay[];
};
