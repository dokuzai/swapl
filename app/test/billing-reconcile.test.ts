// Stripe one-time payment reconciliation (lib/billing/reconcile.ts) —
// payment_intent.succeeded routing by metadata.kind, replay idempotency, and
// refund.created flipping domain rows to refunded. Prisma + email are mocked
// so the logic runs hermetically (same style as favorites.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({
  listingFindUnique: vi.fn(),
  listingUpdate: vi.fn(),
  verificationUpsert: vi.fn(),
  verificationUpdateMany: vi.fn(),
  featuredFindUnique: vi.fn(),
  featuredFindFirst: vi.fn(),
  featuredCreate: vi.fn(),
  featuredUpdate: vi.fn(),
  orderFindFirst: vi.fn(),
  orderCreate: vi.fn(),
  orderUpdateMany: vi.fn(),
  addOnFindUnique: vi.fn(),
  transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  sendEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: mocks.listingFindUnique, update: mocks.listingUpdate },
    listingVerificationPayment: {
      upsert: mocks.verificationUpsert,
      updateMany: mocks.verificationUpdateMany,
    },
    listingFeaturedPurchase: {
      findUnique: mocks.featuredFindUnique,
      findFirst: mocks.featuredFindFirst,
      create: mocks.featuredCreate,
      update: mocks.featuredUpdate,
    },
    orderAddOn: {
      findFirst: mocks.orderFindFirst,
      create: mocks.orderCreate,
      updateMany: mocks.orderUpdateMany,
    },
    addOn: { findUnique: mocks.addOnFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

import { reconcilePaymentIntent, reconcileRefund } from "@/lib/billing/reconcile";

const intent = (
  metadata: Record<string, string>,
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.PaymentIntent =>
  ({ id: "pi_1", amount: 3900, amount_received: 3900, metadata, ...overrides }) as Stripe.PaymentIntent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcilePaymentIntent — routing", () => {
  it("ignores intents without a kind (e.g. subscription invoice PIs)", async () => {
    await reconcilePaymentIntent(intent({}));
    expect(mocks.listingFindUnique).not.toHaveBeenCalled();
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
  });

  it("ignores kinds reconciled elsewhere (insurance_upgrade)", async () => {
    await reconcilePaymentIntent(intent({ kind: "insurance_upgrade" }));
    expect(mocks.listingFindUnique).not.toHaveBeenCalled();
  });
});

describe("verify_listing", () => {
  const listing = {
    id: "l-1",
    title: "Loft in Alfama",
    verificationStatus: "none",
    verificationVideoUrl: null,
    isVerified: false,
  };

  it("records the payment and flips the listing to pending review", async () => {
    mocks.listingFindUnique.mockResolvedValue(listing);
    await reconcilePaymentIntent(
      intent({ kind: "verify_listing", listingId: "l-1", videoUrl: "https://v.example/x" })
    );

    expect(mocks.verificationUpsert).toHaveBeenCalledWith({
      where: { listingId: "l-1" },
      create: { listingId: "l-1", amountCents: 3900, stripePaymentIntentId: "pi_1" },
      update: { stripePaymentIntentId: "pi_1", refunded: false },
    });
    expect(mocks.listingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l-1" },
        data: expect.objectContaining({
          verificationStatus: "pending",
          verificationVideoUrl: "https://v.example/x",
        }),
      })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Loft in Alfama") })
    );
  });

  it("does not reopen a listing already pending or approved (replay safety)", async () => {
    mocks.listingFindUnique.mockResolvedValue({ ...listing, verificationStatus: "pending" });
    await reconcilePaymentIntent(intent({ kind: "verify_listing", listingId: "l-1" }));

    expect(mocks.verificationUpsert).toHaveBeenCalled(); // payment row still reconciled
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("bails on unknown listings without writing", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    await reconcilePaymentIntent(intent({ kind: "verify_listing", listingId: "ghost" }));
    expect(mocks.verificationUpsert).not.toHaveBeenCalled();
  });
});

describe("feature_listing_14d / feature_listing_30d", () => {
  it("creates the purchase and lights the listing up for the duration", async () => {
    mocks.featuredFindUnique.mockResolvedValue(null);
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", featuredUntil: null });
    const before = Date.now();

    await reconcilePaymentIntent(
      intent({ kind: "feature_listing_14d", listingId: "l-1" }, { amount: 1900, amount_received: 1900 })
    );

    expect(mocks.featuredCreate).toHaveBeenCalledTimes(1);
    const created = mocks.featuredCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({
      listingId: "l-1",
      durationDays: 14,
      amountCents: 1900,
      stripePaymentIntentId: "pi_1",
    });
    expect(created.endsAt.getTime() - created.startsAt.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(created.startsAt.getTime()).toBeGreaterThanOrEqual(before);

    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { isFeatured: true, featuredUntil: created.endsAt },
    });
  });

  it("derives 30 days from the kind", async () => {
    mocks.featuredFindUnique.mockResolvedValue(null);
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", featuredUntil: null });
    await reconcilePaymentIntent(intent({ kind: "feature_listing_30d", listingId: "l-1" }));
    expect(mocks.featuredCreate.mock.calls[0][0].data.durationDays).toBe(30);
  });

  it("never shortens an existing longer featured window", async () => {
    const far = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    mocks.featuredFindUnique.mockResolvedValue(null);
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", featuredUntil: far });

    await reconcilePaymentIntent(intent({ kind: "feature_listing_14d", listingId: "l-1" }));

    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { isFeatured: true, featuredUntil: far },
    });
  });

  it("is a no-op on event replay (purchase already recorded for this PI)", async () => {
    mocks.featuredFindUnique.mockResolvedValue({ id: "fp-1" });
    await reconcilePaymentIntent(intent({ kind: "feature_listing_14d", listingId: "l-1" }));
    expect(mocks.featuredCreate).not.toHaveBeenCalled();
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });
});

describe("addon", () => {
  const meta = { kind: "addon", userId: "u-1", agreementId: "agr-1", addOnSlug: "lockbox" };

  it("records a paid order resolved from the add-on slug", async () => {
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.addOnFindUnique.mockResolvedValue({ id: "ao-1", slug: "lockbox" });

    await reconcilePaymentIntent(intent(meta, { amount: 2500, amount_received: 2500 }));

    expect(mocks.addOnFindUnique).toHaveBeenCalledWith({ where: { slug: "lockbox" } });
    expect(mocks.orderCreate).toHaveBeenCalledWith({
      data: {
        userId: "u-1",
        agreementId: "agr-1",
        addOnId: "ao-1",
        status: "paid",
        amountCents: 2500,
        stripePaymentIntentId: "pi_1",
      },
    });
  });

  it("is a no-op on event replay (order already recorded for this PI)", async () => {
    mocks.orderFindFirst.mockResolvedValue({ id: "o-1" });
    await reconcilePaymentIntent(intent(meta));
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("bails on incomplete metadata or unknown slug", async () => {
    await reconcilePaymentIntent(intent({ kind: "addon", userId: "u-1" }));
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();

    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.addOnFindUnique.mockResolvedValue(null);
    await reconcilePaymentIntent(intent(meta));
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});

describe("reconcileRefund", () => {
  const refund = (paymentIntent: Stripe.Refund["payment_intent"]): Stripe.Refund =>
    ({ id: "re_1", payment_intent: paymentIntent }) as Stripe.Refund;

  it("marks add-on orders and verification payments refunded by PI id", async () => {
    mocks.featuredFindUnique.mockResolvedValue(null);
    await reconcileRefund(refund("pi_1"));

    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_1" },
      data: { status: "refunded" },
    });
    expect(mocks.verificationUpdateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_1" },
      data: { refunded: true },
    });
    expect(mocks.featuredUpdate).not.toHaveBeenCalled();
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refunds a featured purchase and unfeatures the listing when nothing else is live", async () => {
    mocks.featuredFindUnique.mockResolvedValue({ id: "fp-1", listingId: "l-1", refunded: false });
    mocks.featuredFindFirst.mockResolvedValue(null);

    await reconcileRefund(refund("pi_1"));

    expect(mocks.featuredUpdate).toHaveBeenCalledWith({
      where: { id: "fp-1" },
      data: { refunded: true },
    });
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { isFeatured: false, featuredUntil: null },
    });
  });

  it("keeps the listing featured on the surviving purchase's window", async () => {
    const otherEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mocks.featuredFindUnique.mockResolvedValue({ id: "fp-1", listingId: "l-1", refunded: false });
    mocks.featuredFindFirst.mockResolvedValue({ id: "fp-2", endsAt: otherEnd });

    await reconcileRefund(refund("pi_1"));

    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { isFeatured: true, featuredUntil: otherEnd },
    });
  });

  it("resolves an expanded payment_intent object and skips refunds without one", async () => {
    mocks.featuredFindUnique.mockResolvedValue(null);
    await reconcileRefund(refund({ id: "pi_9" } as Stripe.PaymentIntent));
    expect(mocks.orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripePaymentIntentId: "pi_9" } })
    );

    vi.clearAllMocks();
    await reconcileRefund(refund(null));
    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
  });
});
