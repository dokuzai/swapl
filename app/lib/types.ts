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

export function propertyLabel(t: PropertyType): string {
  switch (t) {
    case "APARTMENT": return "Apartment";
    case "HOUSE": return "House";
    case "LOFT": return "Loft";
    case "TOWNHOUSE": return "Townhouse";
  }
}
