// Authorization + presentation helpers shared by the /api/insurance routes.
// Kept pure (no Prisma, no next/server) so the trust-critical shaping and the
// "is this user a party to the swap" check can be unit-tested directly.

export interface PolicyRecord {
  id: string;
  agreementId: string;
  provider: string;
  policyNumber: string;
  status: string;
  coverageAmount: number;
  premiumCents: number;
  platformShareCents: number;
  documentsUrl: string | null;
  externalId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

interface ListingContext {
  userId: string;
  city: string;
  neighbourhood: string;
  country: string;
}

export interface AgreementContext {
  dateFrom: Date;
  dateTo: Date;
  listing1: ListingContext;
  listing2: ListingContext;
}

export function userIsParty(
  agreement: { listing1: { userId: string }; listing2: { userId: string } },
  userId: string,
): boolean {
  return agreement.listing1.userId === userId || agreement.listing2.userId === userId;
}

export type PolicyView = {
  id: string;
  agreementId: string;
  provider: string;
  policyNumber: string;
  status: string;
  active: boolean;
  coverageAmount: number;
  premiumCents: number;
  premiumEur: number;
  platformShareCents: number;
  documentsUrl: string | null;
  expiresAt: string;
  createdAt: string;
  swap?: {
    dateFrom: string;
    dateTo: string;
    homes: [string, string];
  };
};

export function policyView(policy: PolicyRecord, agreement?: AgreementContext): PolicyView {
  return {
    id: policy.id,
    agreementId: policy.agreementId,
    provider: policy.provider,
    policyNumber: policy.policyNumber,
    status: policy.status,
    active: policy.status === "active",
    coverageAmount: policy.coverageAmount,
    premiumCents: policy.premiumCents,
    premiumEur: policy.premiumCents / 100,
    platformShareCents: policy.platformShareCents,
    documentsUrl: policy.documentsUrl,
    expiresAt: policy.expiresAt.toISOString(),
    createdAt: policy.createdAt.toISOString(),
    ...(agreement
      ? {
          swap: {
            dateFrom: agreement.dateFrom.toISOString(),
            dateTo: agreement.dateTo.toISOString(),
            homes: [
              `${agreement.listing1.city}, ${agreement.listing1.country}`,
              `${agreement.listing2.city}, ${agreement.listing2.country}`,
            ] as [string, string],
          },
        }
      : {}),
  };
}

// Plain-text Certificate of Cover served by the documents endpoint. The mock
// underwriter has no real PDF, so we render a deterministic, human-readable
// summary from the persisted policy + swap.
export function renderCertificate(policy: PolicyRecord, agreement: AgreementContext): string {
  const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return [
    "swapl — Certificate of Home-Swap Cover",
    "=======================================",
    "",
    `Policy number:   ${policy.policyNumber}`,
    `Underwriter:      ${policy.provider}`,
    `Status:           ${policy.status.toUpperCase()}`,
    `Coverage:         €${policy.coverageAmount.toLocaleString("en-IE")}`,
    `Premium:          ${eur(policy.premiumCents)}`,
    `Valid until:      ${day(policy.expiresAt)}`,
    "",
    "Covered swap",
    "------------",
    `Stay:             ${day(agreement.dateFrom)} → ${day(agreement.dateTo)}`,
    `Home A:           ${agreement.listing1.neighbourhood}, ${agreement.listing1.city}, ${agreement.listing1.country}`,
    `Home B:           ${agreement.listing2.neighbourhood}, ${agreement.listing2.city}, ${agreement.listing2.country}`,
    "",
    "This certificate confirms that the home swap above is covered up to the",
    "stated amount for accidental damage during the stay, subject to the policy",
    "terms. Keep this document for your records.",
    "",
  ].join("\n");
}
