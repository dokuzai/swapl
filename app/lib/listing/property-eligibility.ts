// Pure decision policy for AI-assisted owner verification (DOK-186).
//
// Maps a classifyPropertyDocument() result onto the verification outcome and any
// listing-eligibility side effect. Kept dependency-free (no prisma, no AI client)
// so it is trivially unit-testable and safe to reason about: the AI only PROPOSES,
// the admin always confirms/overrides. This module decides what the SUBMISSION
// flow should record automatically — it never runs on an admin override path.

import type { PropertyDocClassification, PropertyDocResult } from "@/lib/ai/property-doc";

export const BUSINESS_INELIGIBLE_REASON = "business_property";

// Confidence floor below which the AI is treated as "uncertain": we never
// auto-reject a host as a business on a shaky read, and we never auto-approve.
export const BUSINESS_REJECT_MIN_CONFIDENCE = 0.7;
export const OWNER_AUTO_APPROVE_MIN_CONFIDENCE = 0.85;

// Auto-approving a high-confidence private_owner is OFF by default — the safe
// path is "AI proposes, admin confirms". Set PROPERTY_AI_AUTO_APPROVE_OWNER=1 to
// let a high-confidence owner read flip ownerVerified without a human.
function autoApproveOwnerEnabled(): boolean {
  return process.env.PROPERTY_AI_AUTO_APPROVE_OWNER === "1";
}

export type VerificationOutcome = {
  /** Status to persist on the PropertyVerification row. */
  status: "pending" | "approved" | "rejected";
  /** True → set Listing.ownerVerified (full "Verified owner" badge). */
  setOwnerVerified: boolean;
  /** True → mark Listing ineligible (business_property) + exclude from feeds. */
  markIneligible: boolean;
  /** Distinguishes a tenant-verified approval from an owner-verified one. */
  badge: "owner_verified" | "tenant_verified" | null;
  /** Short machine note explaining the automatic decision. */
  note: string;
};

// Decide the automatic outcome for a fresh submission given the AI proposal.
export function decideVerificationOutcome(ai: PropertyDocResult): VerificationOutcome {
  // AI disabled / not vision-capable / unreadable → pure DOK-162: pending for
  // manual admin review. No auto-block, no auto-approve.
  if (ai.aiDisabled || ai.classification === "uncertain") {
    return {
      status: "pending",
      setOwnerVerified: false,
      markIneligible: false,
      badge: null,
      note: ai.aiDisabled ? "ai_disabled_pending_review" : "ai_uncertain_pending_review",
    };
  }

  if (ai.classification === "business") {
    // Only auto-reject + flag ineligible when the model is confident. A weak
    // business signal stays pending so an admin can look.
    if (ai.confidence >= BUSINESS_REJECT_MIN_CONFIDENCE) {
      return {
        status: "rejected",
        setOwnerVerified: false,
        markIneligible: true,
        badge: null,
        note: "ai_business_property_rejected",
      };
    }
    return {
      status: "pending",
      setOwnerVerified: false,
      markIneligible: false,
      badge: null,
      note: "ai_business_low_confidence_pending_review",
    };
  }

  if (ai.classification === "private_tenant") {
    // Eligible to host, but NOT an owner. Approve with a tenant badge; never set
    // ownerVerified (hosting ≠ owning, consistent with DOK-162). Default-safe:
    // unless owner auto-approve is enabled, leave it pending for admin confirm.
    if (autoApproveOwnerEnabled() && ai.confidence >= OWNER_AUTO_APPROVE_MIN_CONFIDENCE) {
      return {
        status: "approved",
        setOwnerVerified: false,
        markIneligible: false,
        badge: "tenant_verified",
        note: "ai_private_tenant_approved",
      };
    }
    return {
      status: "pending",
      setOwnerVerified: false,
      markIneligible: false,
      badge: null,
      note: "ai_private_tenant_pending_review",
    };
  }

  // private_owner → eligible. AI proposes; admin confirms by default. Auto-approve
  // only behind the flag AND at high confidence.
  if (autoApproveOwnerEnabled() && ai.confidence >= OWNER_AUTO_APPROVE_MIN_CONFIDENCE) {
    return {
      status: "approved",
      setOwnerVerified: true,
      markIneligible: false,
      badge: "owner_verified",
      note: "ai_private_owner_approved",
    };
  }
  return {
    status: "pending",
    setOwnerVerified: false,
    markIneligible: false,
    badge: null,
    note: "ai_private_owner_pending_review",
  };
}

// Human-readable label for an AI classification (admin UI / notes).
export function classificationLabel(c: PropertyDocClassification): string {
  switch (c) {
    case "private_owner":
      return "Private owner";
    case "private_tenant":
      return "Private tenant (may host)";
    case "business":
      return "Business / commercial";
    case "uncertain":
      return "Uncertain";
  }
}
