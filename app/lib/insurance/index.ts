// Resolves the active insurance provider. Picks `mock` by default; allow
// switching via INSURANCE_PROVIDER once a real underwriter ships.

import { mockInsuranceProvider } from "./mock";
import type { InsuranceProvider } from "./provider";

export function insuranceProvider(): InsuranceProvider {
  const which = process.env.INSURANCE_PROVIDER ?? "mock";
  switch (which) {
    case "mock":
      return mockInsuranceProvider;
    default:
      // The real implementation will be added here when the underwriter ships.
      // Until then we silently fall back to mock so prod doesn't 500.
      console.warn(`[insurance] unknown provider "${which}", falling back to mock`);
      return mockInsuranceProvider;
  }
}

export type * from "./provider";
