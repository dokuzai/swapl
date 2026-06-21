// Single source of truth for mock premium pricing, shared by the quote
// endpoint and the bind path so a preview always matches what gets charged.
//
// Pricing model (mock-only):
//   premium = 1.4€/m² of the smaller home × number of nights, capped at €120
//   platformShare = round(premium * 0.20)   // 20% partner kickback

// Swapl Guarantee, not insurance: Full-cover ceiling and excess (franchigia).
export const COVERAGE_AMOUNT_EUR = 5_000;
export const DEDUCTIBLE_AMOUNT_EUR = 750;
const PREMIUM_PER_SQM_PER_NIGHT_CENTS = 1.4;
const PREMIUM_CAP_CENTS = 12_000;
const PLATFORM_SHARE = 0.2;
const NIGHT_MS = 24 * 60 * 60 * 1000;

export type Quote = {
  premiumCents: number;
  platformShareCents: number;
  coverageAmount: number;
};

export function nightsBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / NIGHT_MS));
}

export function quotePremium(smallerSqm: number, nights: number): Quote {
  const premiumCents = Math.min(Math.round(smallerSqm * PREMIUM_PER_SQM_PER_NIGHT_CENTS * nights), PREMIUM_CAP_CENTS);
  return {
    premiumCents,
    platformShareCents: Math.round(premiumCents * PLATFORM_SHARE),
    coverageAmount: COVERAGE_AMOUNT_EUR,
  };
}
