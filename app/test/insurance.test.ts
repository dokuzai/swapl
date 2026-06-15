import { describe, expect, it } from "vitest";
import { COVERAGE_AMOUNT_EUR, nightsBetween, quotePremium } from "@/lib/insurance/pricing";
import { mockInsuranceProvider } from "@/lib/insurance/mock";
import {
  policyView,
  renderCertificate,
  userIsParty,
  type AgreementContext,
  type PolicyRecord,
} from "@/lib/insurance/access";

const day = (iso: string) => new Date(iso);

describe("pricing", () => {
  it("counts at least one night and rounds to whole nights", () => {
    expect(nightsBetween(day("2026-06-01"), day("2026-06-08"))).toBe(7);
    expect(nightsBetween(day("2026-06-01T10:00:00Z"), day("2026-06-01T11:00:00Z"))).toBe(1);
  });

  it("prices premium as 1.4¢/m²/night with a 20% platform share", () => {
    // 50 m² × 1.4 × 10 nights = 700¢; share = 140¢
    expect(quotePremium(50, 10)).toEqual({
      premiumCents: 700,
      platformShareCents: 140,
      coverageAmount: COVERAGE_AMOUNT_EUR,
    });
  });

  it("caps the premium at €120", () => {
    const q = quotePremium(800, 365);
    expect(q.premiumCents).toBe(12_000);
    expect(q.platformShareCents).toBe(2_400);
  });
});

describe("mock provider", () => {
  const dateFrom = day("2026-06-01");
  const dateTo = day("2026-06-11"); // 10 nights

  it("quotes off the smaller home and matches the standalone pricing fn", () => {
    const quote = mockInsuranceProvider.quote({
      parties: [{ listing: { sizeSqm: 90 } }, { listing: { sizeSqm: 50 } }],
      dateFrom,
      dateTo,
    });
    expect(quote.nights).toBe(10);
    expect(quote).toMatchObject(quotePremium(50, 10));
  });

  it("binds a policy whose premium equals its quote and exposes a documents url", async () => {
    const input = {
      agreementId: "agr_abc123def",
      parties: [
        {
          userId: "u1",
          fullName: "Ana",
          email: "ana@swapl.test",
          listing: { id: "l1", city: "Lisbon", neighbourhood: "Alfama", country: "Portugal", address: null, sizeSqm: 60 },
        },
        {
          userId: "u2",
          fullName: "Bo",
          email: "bo@swapl.test",
          listing: { id: "l2", city: "Berlin", neighbourhood: "Kreuzberg", country: "Germany", address: null, sizeSqm: 80 },
        },
      ],
      dateFrom,
      dateTo,
    };
    const policy = await mockInsuranceProvider.createPolicy(input);
    expect(policy.premiumCents).toBe(quotePremium(60, 10).premiumCents);
    expect(policy.coverageAmount).toBe(COVERAGE_AMOUNT_EUR);
    expect(policy.policyNumber).toMatch(/^SC-\d{4}-\d{6}$/);
    expect(policy.documentsUrl).toBe(`/api/insurance/documents/${policy.policyNumber}`);
    expect(policy.expiresAt.getTime()).toBe(dateTo.getTime() + 30 * 24 * 60 * 60 * 1000);
  });
});

const samplePolicy: PolicyRecord = {
  id: "pol_1",
  agreementId: "agr_1",
  provider: "swapl-cover",
  policyNumber: "SC-2026-123456",
  status: "active",
  coverageAmount: 150_000,
  premiumCents: 700,
  platformShareCents: 140,
  documentsUrl: "/api/insurance/documents/SC-2026-123456",
  externalId: "mock_sc_2026_123456_agr_1",
  expiresAt: day("2026-07-11T00:00:00Z"),
  createdAt: day("2026-05-29T00:00:00Z"),
};

const sampleAgreement: AgreementContext = {
  dateFrom: day("2026-06-01T00:00:00Z"),
  dateTo: day("2026-06-11T00:00:00Z"),
  listing1: { userId: "u1", city: "Lisbon", neighbourhood: "Alfama", country: "Portugal" },
  listing2: { userId: "u2", city: "Berlin", neighbourhood: "Kreuzberg", country: "Germany" },
};

describe("userIsParty", () => {
  it("recognises either swap party and rejects everyone else", () => {
    expect(userIsParty(sampleAgreement, "u1")).toBe(true);
    expect(userIsParty(sampleAgreement, "u2")).toBe(true);
    expect(userIsParty(sampleAgreement, "stranger")).toBe(false);
  });
});

describe("policyView", () => {
  it("derives euros, the active flag and ISO dates", () => {
    const view = policyView(samplePolicy, sampleAgreement);
    expect(view.premiumEur).toBe(7);
    expect(view.active).toBe(true);
    expect(view.expiresAt).toBe("2026-07-11T00:00:00.000Z");
    expect(view.swap?.homes).toEqual(["Lisbon, Portugal", "Berlin, Germany"]);
  });

  it("marks a pending policy as not active and omits swap context when absent", () => {
    const view = policyView({ ...samplePolicy, status: "pending" });
    expect(view.active).toBe(false);
    expect(view.swap).toBeUndefined();
  });

  it("exposes null on-chain fields when not anchored (DOK-156 default)", () => {
    const view = policyView(samplePolicy, sampleAgreement);
    expect(view.onChainRef).toBeNull();
    expect(view.onChainStatus).toBeNull();
    expect(view.explorerUrl).toBeNull();
  });

  it("surfaces the proof-of-cover ref + explorer URL once anchored", () => {
    const view = policyView(
      { ...samplePolicy, onChainRef: "deadbeef", onChainNetwork: "testnet", onChainStatus: "anchored", anchoredAt: day("2026-05-30T00:00:00Z") },
      sampleAgreement,
    );
    expect(view.onChainStatus).toBe("anchored");
    expect(view.explorerUrl).toBe("https://testnet.tonviewer.com/transaction/deadbeef");
    expect(view.anchoredAt).toBe("2026-05-30T00:00:00.000Z");
  });
});

describe("renderCertificate", () => {
  it("includes the policy number, coverage, both homes and the stay window", () => {
    const cert = renderCertificate(samplePolicy, sampleAgreement);
    expect(cert).toContain("SC-2026-123456");
    expect(cert).toContain("€150,000");
    expect(cert).toContain("Alfama, Lisbon, Portugal");
    expect(cert).toContain("Kreuzberg, Berlin, Germany");
    expect(cert).toContain("2026-06-01 → 2026-06-11");
  });
});
