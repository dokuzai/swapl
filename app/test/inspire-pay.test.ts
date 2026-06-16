// Pay-on-accept for "Get Inspired" packages (DOK-148).
//
// Hermetic (Stripe + prisma mocked). Pins the money rules:
// - the off-session PaymentIntent is created ONLY in the accept handler of
//   POST /api/proposals/{id}, and ONLY for the package's selected concierge
//   add-ons (affiliate items are never charged by us);
// - a failed charge flags the package + notifies the member but the proposal
//   stays ACCEPTED;
// - decline/withdraw cancel the payment (nothing was ever charged);
// - the webhook reconciler turns a succeeded inspire_package PI into paid
//   OrderAddOn rows, idempotently.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  proposalFindUnique: vi.fn(),
  proposalUpdate: vi.fn(),
  txProposalUpdate: vi.fn(),
  txAgreementCreate: vi.fn(),
  txPolicyCreate: vi.fn(),
  pkgFindFirst: vi.fn(),
  pkgFindUnique: vi.fn(),
  pkgUpdate: vi.fn(),
  pkgUpdateMany: vi.fn(),
  customerFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  addOnFindUnique: vi.fn(),
  orderFindFirst: vi.fn(),
  orderCreate: vi.fn(),
  agreementFindUnique: vi.fn(),
  occupancyCreate: vi.fn(async () => ({})),
  paymentIntentCreate: vi.fn(),
  sendEmail: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  prisma: {
    swapProposal: { findUnique: mocks.proposalFindUnique, update: mocks.proposalUpdate },
    inspirationPackage: {
      findFirst: mocks.pkgFindFirst,
      findUnique: mocks.pkgFindUnique,
      update: mocks.pkgUpdate,
      updateMany: mocks.pkgUpdateMany,
    },
    stripeCustomer: { findUnique: mocks.customerFindUnique },
    user: { findUnique: mocks.userFindUnique },
    addOn: { findUnique: mocks.addOnFindUnique },
    orderAddOn: { findFirst: mocks.orderFindFirst, create: mocks.orderCreate },
    swapAgreement: { findUnique: mocks.agreementFindUnique, findMany: async () => [] },
    // DOK-159: the accept path checks per-listing availability via
    // bookedRangesFor() before creating the agreement. No conflicts seeded here.
    keysStay: { findMany: async () => [] },
    listingBlockedRange: { findMany: async () => [] },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        swapProposal: { update: mocks.txProposalUpdate },
        swapAgreement: { create: mocks.txAgreementCreate, findMany: async () => [] },
        keysStay: { findMany: async () => [] },
        listingBlockedRange: { findMany: async () => [] },
        listingOccupancy: { create: mocks.occupancyCreate },
        insurancePolicy: { create: mocks.txPolicyCreate },
      }),
  },
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({ paymentIntents: { create: mocks.paymentIntentCreate } }),
  isStripeConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY),
  STRIPE_WEBHOOK_SECRET: "",
  BillingNotConfigured: class BillingNotConfigured extends Error {},
}));
vi.mock("@/lib/discover", () => ({ getDiscoverExperiences: vi.fn() }));
vi.mock("@/lib/insurance", () => ({
  insuranceProvider: () => ({
    name: "fallback",
    createPolicy: vi.fn().mockRejectedValue(new Error("no insurance provider in tests")),
  }),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: {
    proposalAccepted: vi.fn(() => ({})),
    proposalDeclined: vi.fn(() => ({})),
  },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: {
    proposalAccepted: vi.fn(() => ({})),
    proposalDeclined: vi.fn(() => ({})),
  },
}));

import { POST as actOnProposal } from "@/app/api/proposals/[id]/route";
import {
  reconcilePaymentIntent,
  reconcilePaymentIntentFailed,
  reconcileSetupIntent,
} from "@/lib/billing/reconcile";

const PAYLOAD = {
  myListingId: "l-mine",
  addOns: [
    { id: "addon-cleaning-mid", selected: true, slug: "cleaning-mid", name: "Cleaning", description: "d", priceCents: 6900, currency: "EUR", provider: "swapl", category: "cleaning" },
    { id: "addon-lockbox", selected: false, slug: "lockbox", name: "Lockbox", description: "d", priceCents: 1900, currency: "EUR", provider: "keynest", category: "lockbox" },
    { id: "addon-city-guide", selected: true, slug: "city-guide", name: "Guide", description: "d", priceCents: 900, currency: "EUR", provider: "swapl", category: "guide" },
  ],
  experiences: [{ id: "exp-1", selected: true, title: "Tour", url: "/x" }],
  services: [{ id: "svc-skyscanner", selected: true, slug: "skyscanner", url: "/y" }],
};

const SAVED_PKG = {
  id: "pkg-1",
  userId: "u-1",
  status: "confirmed",
  proposalId: "prop-1",
  payload: JSON.stringify(PAYLOAD),
  setupIntentId: "seti_1",
  paymentMethodId: "pm_1",
  paymentStatus: "saved",
};

function party(userId: string, listingId: string) {
  return {
    id: listingId,
    userId,
    city: "Lisbon",
    neighbourhood: "Alfama",
    country: "Portugal",
    address: "Rua 1",
    sizeSqm: 80,
    user: { id: userId, email: `${userId}@swapl.test`, name: userId, suspendedAt: null },
  };
}

const PROPOSAL = {
  id: "prop-1",
  status: "PENDING",
  proposerId: "u-1",
  proposerListingId: "l-mine",
  targetListingId: "l-a",
  dateFrom: new Date("2026-07-10"),
  dateTo: new Date("2026-07-20"),
  proposerListing: party("u-1", "l-mine"),
  targetListing: party("u-2", "l-a"),
  agreement: null,
};

function act(action: string) {
  return actOnProposal(
    new Request("https://swapl.test/api/proposals/prop-1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id: "prop-1" }) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-2", email: "u-2@swapl.test" });
  mocks.proposalFindUnique.mockResolvedValue(PROPOSAL);
  mocks.proposalUpdate.mockResolvedValue({});
  mocks.txProposalUpdate.mockResolvedValue({ ...PROPOSAL, status: "ACCEPTED" });
  mocks.txAgreementCreate.mockResolvedValue({ id: "agr-1" });
  mocks.txPolicyCreate.mockResolvedValue({});
  mocks.pkgFindFirst.mockResolvedValue(SAVED_PKG);
  mocks.pkgUpdate.mockResolvedValue({});
  mocks.pkgUpdateMany.mockResolvedValue({ count: 1 });
  mocks.customerFindUnique.mockResolvedValue({ stripeId: "cus_1" });
  mocks.userFindUnique.mockResolvedValue({ email: "u-1@swapl.test" });
  mocks.paymentIntentCreate.mockResolvedValue({ id: "pi_1", status: "succeeded" });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.sendPush.mockResolvedValue(undefined);
});

describe("accept hook — off-session charge for the linked package", () => {
  it("charges ONLY the selected payable add-ons, off-session, after acceptance", async () => {
    const res = await act("accept");
    expect(res.status).toBe(200);
    expect((await res.json()).agreementId).toBe("agr-1");

    expect(mocks.pkgFindFirst).toHaveBeenCalledWith({
      where: { proposalId: "prop-1", status: "confirmed", paymentStatus: "saved" },
    });
    expect(mocks.paymentIntentCreate).toHaveBeenCalledTimes(1);
    const pi = mocks.paymentIntentCreate.mock.calls[0][0];
    // 6900 + 900 — the deselected lockbox (1900) is NOT charged, nor are
    // affiliate experiences/services (not chargeable by us at all).
    expect(pi.amount).toBe(7800);
    expect(pi).toMatchObject({
      currency: "eur",
      customer: "cus_1",
      payment_method: "pm_1",
      off_session: true,
      confirm: true,
      metadata: { kind: "inspire_package", packageId: "pkg-1", userId: "u-1", addOnSlugs: "cleaning-mid,city-guide" },
    });
    expect(mocks.pkgUpdate).toHaveBeenCalledWith({ where: { id: "pkg-1" }, data: { paymentStatus: "charged" } });
  });

  it("does not touch Stripe when no confirmed+saved package is linked", async () => {
    mocks.pkgFindFirst.mockResolvedValue(null);
    const res = await act("accept");
    expect(res.status).toBe(200);
    expect(mocks.paymentIntentCreate).not.toHaveBeenCalled();
  });

  it("charges nothing without Stripe configured (env-gated degrade)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const res = await act("accept");
    expect(res.status).toBe(200);
    expect(mocks.paymentIntentCreate).not.toHaveBeenCalled();
    // The package stays "saved" — recoverable later; the swap is unaffected.
    expect(mocks.pkgUpdate).not.toHaveBeenCalled();
  });

  it("a FAILED charge leaves the proposal accepted, flags the package and notifies the member", async () => {
    mocks.paymentIntentCreate.mockRejectedValue(new Error("card_declined"));
    const res = await act("accept");

    // Acceptance stands: 200, agreement created, status flipped.
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mocks.txProposalUpdate).toHaveBeenCalledWith({ where: { id: "prop-1" }, data: { status: "ACCEPTED" } });

    expect(mocks.pkgUpdate).toHaveBeenCalledWith({ where: { id: "pkg-1" }, data: { paymentStatus: "failed" } });
    // The member is told their swap is safe and only the extras payment failed.
    const failureEmail = mocks.sendEmail.mock.calls
      .map((c) => c[0])
      .find((m) => m && typeof m === "object" && "subject" in m && /payment didn't go through/i.test(String(m.subject)));
    expect(failureEmail).toMatchObject({ to: "u-1@swapl.test" });
    expect(mocks.sendPush).toHaveBeenCalledWith("u-1", expect.objectContaining({ title: "Extras payment failed" }));
  });
});

describe("decline / withdraw — payment canceled, never charged", () => {
  it("decline marks the package payment canceled", async () => {
    const res = await act("decline");
    expect(res.status).toBe(200);
    expect(mocks.paymentIntentCreate).not.toHaveBeenCalled();
    expect(mocks.pkgUpdateMany).toHaveBeenCalledWith({
      where: { proposalId: "prop-1", paymentStatus: { in: ["none", "saved"] } },
      data: { paymentStatus: "canceled" },
    });
  });

  it("withdraw (by the proposer) marks the package payment canceled", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1", email: "u-1@swapl.test" });
    const res = await act("withdraw");
    expect(res.status).toBe(200);
    expect(mocks.pkgUpdateMany).toHaveBeenCalledWith({
      where: { proposalId: "prop-1", paymentStatus: { in: ["none", "saved"] } },
      data: { paymentStatus: "canceled" },
    });
  });

  it("an already-charged package is NOT flipped to canceled", async () => {
    await act("decline");
    const where = mocks.pkgUpdateMany.mock.calls[0][0].where;
    expect(where.paymentStatus.in).not.toContain("charged");
  });
});

describe("webhook reconciliation for kind=inspire_package", () => {
  const intent = (over: Partial<Stripe.PaymentIntent> = {}) =>
    ({
      id: "pi_1",
      amount: 7800,
      amount_received: 7800,
      metadata: { kind: "inspire_package", packageId: "pkg-1", userId: "u-1" },
      ...over,
    }) as Stripe.PaymentIntent;

  beforeEach(() => {
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.pkgFindUnique.mockResolvedValue(SAVED_PKG);
    mocks.agreementFindUnique.mockResolvedValue({ id: "agr-1" });
    mocks.addOnFindUnique.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve({ id: `db-${where.slug}`, slug: where.slug })
    );
    mocks.orderCreate.mockResolvedValue({});
  });

  it("payment_intent.succeeded creates paid OrderAddOn rows for the selected add-ons only", async () => {
    await reconcilePaymentIntent(intent());
    expect(mocks.orderCreate).toHaveBeenCalledTimes(2);
    expect(mocks.orderCreate).toHaveBeenCalledWith({
      data: {
        userId: "u-1",
        agreementId: "agr-1",
        addOnId: "db-cleaning-mid",
        status: "paid",
        amountCents: 6900,
        stripePaymentIntentId: "pi_1",
        notes: "inspire_package:pkg-1",
      },
    });
    expect(mocks.pkgUpdateMany).toHaveBeenCalledWith({
      where: { id: "pkg-1" },
      data: { paymentStatus: "charged" },
    });
  });

  it("is idempotent on event replay", async () => {
    mocks.orderFindFirst.mockResolvedValue({ id: "existing" });
    await reconcilePaymentIntent(intent());
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("payment_intent.payment_failed flags the package (unless already charged)", async () => {
    await reconcilePaymentIntentFailed(intent());
    expect(mocks.pkgUpdateMany).toHaveBeenCalledWith({
      where: { id: "pkg-1", paymentStatus: { not: "charged" } },
      data: { paymentStatus: "failed" },
    });
    mocks.pkgUpdateMany.mockClear();
    await reconcilePaymentIntentFailed(intent({ metadata: { kind: "addon" } } as never));
    expect(mocks.pkgUpdateMany).not.toHaveBeenCalled();
  });

  it("setup_intent.succeeded stamps the saved card on the package", async () => {
    await reconcileSetupIntent({
      id: "seti_1",
      payment_method: "pm_1",
      metadata: { kind: "inspire_package", packageId: "pkg-1" },
    } as unknown as Stripe.SetupIntent);
    expect(mocks.pkgUpdateMany).toHaveBeenCalledWith({
      where: { id: "pkg-1", paymentStatus: "none" },
      data: { paymentMethodId: "pm_1", paymentStatus: "saved" },
    });
  });
});
