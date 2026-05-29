// Deterministic mock underwriter. Returns plausible policy numbers so
// integration tests can assert on shape without an external network call.
// Pricing lives in ./pricing so the quote preview and the bound policy
// always agree.

import { nightsBetween, quotePremium } from "./pricing";
import type {
  CancelPolicyResult,
  CreatePolicyInput,
  CreatePolicyResult,
  InsuranceProvider,
  QuoteInput,
  QuoteResult,
} from "./provider";

function priceFor(input: QuoteInput): QuoteResult {
  const nights = nightsBetween(input.dateFrom, input.dateTo);
  const smallerSqm = Math.min(...input.parties.map((p) => p.listing.sizeSqm));
  return { nights, ...quotePremium(smallerSqm, nights) };
}

export const mockInsuranceProvider: InsuranceProvider = {
  name: "swapl-cover",

  quote(input: QuoteInput): QuoteResult {
    return priceFor(input);
  },

  async createPolicy(input: CreatePolicyInput): Promise<CreatePolicyResult> {
    const { premiumCents, platformShareCents, coverageAmount } = priceFor(input);

    const policyNumber = `SC-${new Date().getFullYear()}-${randomBlock()}`;
    const externalId = `mock_${policyNumber.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${input.agreementId.slice(-6)}`;

    return {
      policyNumber,
      externalId,
      premiumCents,
      platformShareCents,
      coverageAmount,
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
