// Shared domain enums (string-coded because SQLite has no native enums).

export const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LOFT", "TOWNHOUSE"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPOSAL_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "COUNTERED",
  "WITHDRAWN",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const AGREEMENT_STATUSES = ["ACTIVE", "COMPLETED", "INTERRUPTED"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

import type { DictKey } from "@/lib/i18n/dict-en";

// Maps a property type to its i18n key. Render via `t(dict, propertyTypeKey(t))`
// (server) or `t(propertyTypeKey(t))` (client). Mirrors mobile's
// `create_prop_*` taxonomy.
export function propertyTypeKey(t: PropertyType): DictKey {
  switch (t) {
    case "APARTMENT": return "propertyType.apartment";
    case "HOUSE": return "propertyType.house";
    case "LOFT": return "propertyType.loft";
    case "TOWNHOUSE": return "propertyType.townhouse";
  }
}

// Stable ENGLISH property label for non-UI consumers (AI prompt input). Must
// stay in English regardless of locale — never localize this.
export function propertyLabelEn(t: PropertyType): string {
  switch (t) {
    case "APARTMENT": return "Apartment";
    case "HOUSE": return "House";
    case "LOFT": return "Loft";
    case "TOWNHOUSE": return "Townhouse";
  }
}
