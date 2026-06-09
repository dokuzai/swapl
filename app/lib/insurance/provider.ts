// Adapter interface for the insurance underwriter. The concrete implementation
// is selected at runtime by INSURANCE_PROVIDER (env). v1 ships with the mock
// only — when a real underwriter signs we drop in a sibling file.

export type CreatePolicyInput = {
  agreementId: string;
  // Both directions are written into a single multi-property policy.
  parties: Array<{
    userId: string;
    fullName: string;
    email: string;
    listing: {
      id: string;
      city: string;
      neighbourhood: string;
      country: string;
      address?: string | null;
      sizeSqm: number;
    };
  }>;
  dateFrom: Date;
  dateTo: Date;
};

export type CreatePolicyResult = {
  policyNumber: string;
  externalId: string;
  premiumCents: number;        // total premium charged to the underwriter
  platformShareCents: number;  // swapl revenue share (typically ~20% of premium)
  coverageAmount: number;      // headline cover in EUR
  expiresAt: Date;             // 30 days after dateTo
  documentsUrl: string | null;
};

export type CancelPolicyResult = { ok: true; cancelledAt: Date };

// A non-binding price preview. Only needs the property sizes and the dates —
// no personal data — so it can be shown before a swap is accepted.
export type QuoteInput = {
  parties: Array<{ listing: { sizeSqm: number } }>;
  dateFrom: Date;
  dateTo: Date;
};

export type QuoteResult = {
  nights: number;
  premiumCents: number;
  platformShareCents: number;
  coverageAmount: number;
};

export interface InsuranceProvider {
  readonly name: string;
  quote(input: QuoteInput): QuoteResult;
  createPolicy(input: CreatePolicyInput): Promise<CreatePolicyResult>;
  cancelPolicy(externalId: string): Promise<CancelPolicyResult>;
}
