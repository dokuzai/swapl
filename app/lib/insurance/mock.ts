// Deterministic mock underwriter. Returns plausible policy numbers so
// integration tests can assert on shape without an external network call.
//
// Pricing model (mock-only):
//   premium = 1.4€/m² of the smaller home × number of nights, capped at €120
//   platformShare = round(premium * 0.20)          // 20% partner kickback
// These numbers exist so the admin "Revenue share" tile shows realistic data.

import type { CreatePolicyInput, CreatePolicyResult, InsuranceProvider, CancelPolicyResult } from "./provider";

export const mockInsuranceProvider: InsuranceProvider = {
  name: "swapl-cover",
  async createPolicy(input: CreatePolicyInput): Promise<CreatePolicyResult> {
    const nights = Math.max(1, Math.round((input.dateTo.getTime() - input.dateFrom.getTime()) / (24 * 60 * 60 * 1000)));
    const smallerSqm = Math.min(...input.parties.map((p) => p.listing.sizeSqm));
    const premiumCents = Math.min(Math.round(smallerSqm * 1.4 * nights), 12000);
    const platformShareCents = Math.round(premiumCents * 0.2);

    const policyNumber = `SC-${new Date().getFullYear()}-${randomBlock()}`;
    const externalId = `mock_${policyNumber.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${input.agreementId.slice(-6)}`;

    return {
      policyNumber,
      externalId,
      premiumCents,
      platformShareCents,
      coverageAmount: 150_000,
      expiresAt: new Date(input.dateTo.getTime() + 30 * 24 * 60 * 60 * 1000),
      documentsUrl: `/api/insurance/documents/${policyNumber}`,
    };
  },

  async cancelPolicy(): Promise<CancelPolicyResult> {
    return { ok: true, cancelledAt: new Date() };
  },
};

function randomBlock(): string {
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
}
