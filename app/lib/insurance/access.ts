// Authorization + presentation helpers for the Swapl Guarantee, shared by the
// /api/insurance routes (route path kept stable for the mobile API contract).
// Kept pure (no Prisma, no next/server) so the trust-critical shaping and the
// "is this user a party to the swap" check can be unit-tested directly.

export interface PolicyRecord {
  id: string;
  agreementId: string;
  provider: string;
  policyNumber: string;
  status: string;
  tier?: string;              // "goodwill" (free) | "full" (paid add-on)
  coverageAmount: number;     // Full-cover ceiling in EUR
  deductibleAmount?: number;  // excess / franchigia in EUR
  premiumCents: number;
  platformShareCents: number;
  documentsUrl: string | null;
  externalId: string | null;
  expiresAt: Date;
  createdAt: Date;
  // DOK-156 — env-gated TON proof-of-cover anchor (all null when disabled).
  onChainRef?: string | null;
  onChainNetwork?: string | null;
  onChainStatus?: string | null;
  anchoredAt?: Date | null;
}

// Pure explorer-URL builder for the proof-of-cover badge. Kept inline here (not
// imported from lib/chain/ton) so this presentation module stays client-safe
// and free of the server-only TON SDK / node:crypto.
export function tonExplorerUrl(
  ref: string | null | undefined,
  network: string | null | undefined,
): string | null {
  if (!ref) return null;
  const host = network === "mainnet" ? "tonviewer.com" : "testnet.tonviewer.com";
  return `https://${host}/transaction/${ref}`;
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
  // DOK-156 — proof-of-cover. onChain* are null when anchoring is disabled.
  onChainRef: string | null;
  onChainNetwork: string | null;
  onChainStatus: string | null;
  anchoredAt: string | null;
  explorerUrl: string | null;
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
    onChainRef: policy.onChainRef ?? null,
    onChainNetwork: policy.onChainNetwork ?? null,
    onChainStatus: policy.onChainStatus ?? null,
    anchoredAt: policy.anchoredAt ? policy.anchoredAt.toISOString() : null,
    explorerUrl: tonExplorerUrl(policy.onChainRef, policy.onChainNetwork),
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

// Plain-text Swapl Guarantee cover note served by the documents endpoint. There
// is no insurer and no real PDF, so we render a deterministic, human-readable
// summary from the persisted guarantee record + swap.
export function renderCertificate(policy: PolicyRecord, agreement: AgreementContext): string {
  const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const excess = policy.deductibleAmount ?? 750;
  return [
    "swapl — Swapl Guarantee Cover Note",
    "==================================",
    "",
    `Guarantee no.:   ${policy.policyNumber}`,
    `Backed by:       ${policy.provider} (a swapl guarantee — not insurance)`,
    `Tier:            ${(policy.tier ?? "goodwill").toUpperCase()}`,
    `Status:          ${policy.status.toUpperCase()}`,
    `Full cover up to: €${policy.coverageAmount.toLocaleString("en-IE")}`,
    `Excess:          €${excess.toLocaleString("en-IE")}`,
    `Charge:          ${eur(policy.premiumCents)}`,
    `Valid until:     ${day(policy.expiresAt)}`,
    "",
    "Covered swap",
    "------------",
    `Stay:            ${day(agreement.dateFrom)} → ${day(agreement.dateTo)}`,
    `Home A:          ${agreement.listing1.neighbourhood}, ${agreement.listing1.city}, ${agreement.listing1.country}`,
    `Home B:          ${agreement.listing2.neighbourhood}, ${agreement.listing2.city}, ${agreement.listing2.country}`,
    "",
    "This is the Swapl Guarantee — a commitment from swapl, not an insurance",
    "policy, and no licensed insurer is involved. With Full cover, swapl helps",
    "with accidental damage during the stay up to the stated amount, less the",
    "excess, subject to the guarantee terms. Keep this document for your records.",
    "",
  ].join("\n");
}
