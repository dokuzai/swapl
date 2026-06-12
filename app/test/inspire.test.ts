// lib/ai/inspire + /api/assistant/inspire* (DOK-146).
//
// Hermetic (no AI key, mocked prisma). Pins:
// - only real/active/date-compatible listings enter the candidate query, own
//   listings excluded;
// - user dates win, otherwise the user's own availability (dates.source);
// - wishlist + profile-city boosts re-rank the candidates;
// - confirm goes through the REAL POST /api/proposals handler, so plan
//   limits produce the same 402 and a success creates a real proposal.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  listingFindFirst: vi.fn(),
  listingFindMany: vi.fn(),
  listingFindUnique: vi.fn(),
  favoriteFindMany: vi.fn(),
  profileFindUnique: vi.fn(),
  packageCreate: vi.fn(),
  packageFindUnique: vi.fn(),
  packageUpdate: vi.fn(),
  addOnFindMany: vi.fn(),
  stripeCustomerFindUnique: vi.fn(),
  proposalCreate: vi.fn(),
  orgMemberFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  getDiscoverExperiences: vi.fn(),
  sendEmail: vi.fn(),
  sendPush: vi.fn(),
  setupIntentCreate: vi.fn(),
  setupIntentRetrieve: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    listing: { findFirst: mocks.listingFindFirst, findMany: mocks.listingFindMany, findUnique: mocks.listingFindUnique },
    favorite: { findMany: mocks.favoriteFindMany },
    travelProfile: { findUnique: mocks.profileFindUnique },
    inspirationPackage: { create: mocks.packageCreate, findUnique: mocks.packageFindUnique, update: mocks.packageUpdate },
    addOn: { findMany: mocks.addOnFindMany },
    stripeCustomer: { findUnique: mocks.stripeCustomerFindUnique },
    swapProposal: { create: mocks.proposalCreate },
    organizationMember: { findFirst: mocks.orgMemberFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    setupIntents: { create: mocks.setupIntentCreate, retrieve: mocks.setupIntentRetrieve },
  }),
  isStripeConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY),
  STRIPE_WEBHOOK_SECRET: "",
  BillingNotConfigured: class BillingNotConfigured extends Error {},
}));
vi.mock("@/lib/discover", () => ({ getDiscoverExperiences: mocks.getDiscoverExperiences }));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { proposalReceived: vi.fn(() => ({})) },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { proposalReceived: vi.fn(() => ({})) },
}));

import { composePackage, extractTripFilters, InspireError } from "@/lib/ai/inspire";
import { POST as inspire } from "@/app/api/assistant/inspire/route";
import { POST as confirm } from "@/app/api/assistant/inspire/[id]/confirm/route";
import { POST as dismiss } from "@/app/api/assistant/inspire/[id]/dismiss/route";
import { PATCH as patchItems } from "@/app/api/assistant/inspire/[id]/items/route";
import { POST as checkout } from "@/app/api/assistant/inspire/[id]/checkout/route";

const AI_ENVS = ["AI_API_KEY", "AI_PROVIDER", "KIMI_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
const AFF_ENVS = ["AFF_SKYSCANNER_ID", "AFF_AIRALO_ID", "AFF_GETYOURGUIDE_ID", "AFF_BATTLEFACE_ID"];

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

function listing(id: string, userId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    userId,
    title: `Home ${id}`,
    city: "Lisbon",
    country: "Portugal",
    neighbourhood: "Alfama",
    propertyType: "APARTMENT",
    sizeSqm: 80,
    sleeps: 4,
    bedrooms: 2,
    petsAllowed: false,
    wfhSetup: false,
    stepFreeAccess: false,
    availableFrom: new Date("2026-07-01"),
    availableTo: new Date("2026-08-31"),
    photos: JSON.stringify([`https://img.test/${id}.jpg`]),
    tags: "[]",
    ...over,
  };
}

const MY = listing("l-mine", "u-1", { city: "Milan", neighbourhood: "Isola" });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of [...AI_ENVS, ...AFF_ENVS, "STRIPE_SECRET_KEY"]) vi.stubEnv(k, "");
  mocks.addOnFindMany.mockResolvedValue([]);
  mocks.stripeCustomerFindUnique.mockResolvedValue({ stripeId: "cus_1" });
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.userFindUnique.mockResolvedValue({ name: "Ana", aiProvider: null, aiModel: null, aiApiKey: null, suspendedAt: null });
  mocks.userUpdate.mockResolvedValue({});
  mocks.listingFindFirst.mockResolvedValue(MY);
  mocks.listingFindMany.mockResolvedValue([listing("l-a", "u-2"), listing("l-b", "u-3", { city: "Porto" })]);
  mocks.favoriteFindMany.mockResolvedValue([]);
  mocks.profileFindUnique.mockResolvedValue({
    summary: "s",
    traits: JSON.stringify({ themes: [], cities: [], vibe: null, constraints: [] }),
    sourcesUsed: "[]",
    updatedAt: new Date(),
  });
  mocks.packageCreate.mockResolvedValue({ id: "pkg-1" });
  mocks.getDiscoverExperiences.mockResolvedValue([]);
  mocks.orgMemberFindFirst.mockResolvedValue(null);
  mocks.subscriptionFindUnique.mockResolvedValue(null);
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.sendPush.mockResolvedValue(undefined);
});

describe("composePackage", () => {
  it("queries only active, date-compatible candidates and excludes the user's own listings", async () => {
    await composePackage("u-1", { dateFrom: "2026-07-10", dateTo: "2026-07-20" });
    const where = mocks.listingFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.NOT).toEqual({ userId: "u-1" });
    expect(where.availableFrom).toEqual({ lte: new Date("2026-07-20") });
    expect(where.availableTo).toEqual({ gte: new Date("2026-07-10") });
  });

  it("uses the user's dates when given (source 'user'), own availability otherwise", async () => {
    const withDates = await composePackage("u-1", { dateFrom: "2026-07-10", dateTo: "2026-07-20" });
    expect(withDates.dates).toEqual({ from: "2026-07-10", to: "2026-07-20", source: "user" });

    const noDates = await composePackage("u-1", {});
    expect(noDates.dates).toEqual({ from: "2026-07-01", to: "2026-08-31", source: "availability" });
    const where = mocks.listingFindMany.mock.calls[1][0].where;
    expect(where.availableTo).toEqual({ gte: MY.availableFrom });
  });

  it("boosts wishlisted candidates above higher-base-score ones", async () => {
    // l-big matches my home better (same size/sleeps); l-fav is smaller but hearted.
    mocks.listingFindMany.mockResolvedValue([
      listing("l-big", "u-2", { sizeSqm: 80, sleeps: 4 }),
      listing("l-fav", "u-3", { sizeSqm: 70, sleeps: 4, city: "Porto" }),
    ]);
    mocks.favoriteFindMany.mockResolvedValue([{ listingId: "l-fav" }]);
    const pkg = await composePackage("u-1", {});
    expect(pkg.destination.listingId).toBe("l-fav");
    expect(pkg.alternatives.map((a) => a.listingId)).toEqual(["l-big"]);
  });

  it("boosts cities found in the travel-profile traits", async () => {
    mocks.listingFindMany.mockResolvedValue([
      listing("l-big", "u-2", { sizeSqm: 80, sleeps: 4 }),
      listing("l-porto", "u-3", { sizeSqm: 70, sleeps: 4, city: "Porto" }),
    ]);
    mocks.profileFindUnique.mockResolvedValue({
      summary: "s",
      traits: JSON.stringify({ themes: [], cities: ["porto"], vibe: null, constraints: [] }),
      sourcesUsed: "[]",
      updatedAt: new Date(),
    });
    const pkg = await composePackage("u-1", {});
    expect(pkg.destination.listingId).toBe("l-porto");
  });

  it("composes deterministically without an AI key and saves a draft", async () => {
    const pkg = await composePackage("u-1", {});
    expect(pkg.source).toBe("fallback");
    expect(pkg.proposalMessageSource).toBe("fallback");
    expect(pkg.proposalMessage.length).toBeGreaterThan(20);
    expect(pkg.destination.why).toMatch(/match/);
    expect(pkg.packageId).toBe("pkg-1");
    const created = mocks.packageCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({ userId: "u-1", status: "draft" });
    expect(JSON.parse(created.payload).destination.listingId).toBe(pkg.destination.listingId);
  });

  it("only surfaces env-configured affiliate services, with the destination city in the link", async () => {
    const none = await composePackage("u-1", {});
    expect(none.services).toEqual([]);

    vi.stubEnv("AFF_SKYSCANNER_ID", "sky-1");
    vi.stubEnv("AFF_AIRALO_ID", "air-1");
    const pkg = await composePackage("u-1", {});
    expect(pkg.services.map((s) => s.slug).sort()).toEqual(["airalo", "skyscanner"]);
    for (const s of pkg.services) {
      expect(s.url).toContain(`/api/affiliate/${s.slug}?`);
      expect(s.url).toContain("city=Lisbon");
      expect(s.url).toContain("utm_campaign=inspire_package");
    }
  });

  it("throws NO_ACTIVE_LISTING without an own active listing, NO_CANDIDATES on an empty pool", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);
    await expect(composePackage("u-1", {})).rejects.toMatchObject({ code: "NO_ACTIVE_LISTING" });
    expect(mocks.packageCreate).not.toHaveBeenCalled();

    mocks.listingFindFirst.mockResolvedValue(MY);
    mocks.listingFindMany.mockResolvedValue([]);
    await expect(composePackage("u-1", {})).rejects.toBeInstanceOf(InspireError);
  });
});

describe("POST /api/assistant/inspire", () => {
  const post = (body: unknown) =>
    inspire(
      new Request("https://swapl.test/api/assistant/inspire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  it("returns the composed package", async () => {
    const res = await post({ dateFrom: "2026-07-10", dateTo: "2026-07-20" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packageId).toBe("pkg-1");
    expect(body.dates.source).toBe("user");
  });

  it("maps InspireError to 422 and bad dates to 400", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);
    const res = await post({});
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("NO_ACTIVE_LISTING");

    expect((await post({ dateFrom: "2026-07-20", dateTo: "2026-07-10" })).status).toBe(400);
  });

  it("requires auth", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await post({})).status).toBe(401);
  });
});

// ---------- confirm: must reuse the REAL POST /api/proposals code path ----------

const PAYLOAD = {
  myListingId: "l-mine",
  destination: { listingId: "l-a", city: "Lisbon", country: "Portugal", title: "Home l-a", photo: null, matchScore: 80, why: "w" },
  alternatives: [{ listingId: "l-b", city: "Porto", country: "Portugal", title: "Home l-b", photo: null, matchScore: 70 }],
  dates: { from: "2026-07-10", to: "2026-07-20", source: "user" },
  proposalMessage: "Hello there, fancy a swap?",
  proposalMessageSource: "fallback",
  experiences: [],
  services: [],
  source: "fallback",
};

function confirmReq(body: unknown = {}) {
  return new Request("https://swapl.test/api/assistant/inspire/pkg-1/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "pkg-1" }) } as never;

// The proposals route reads user.findUnique three times with different
// selects (suspension, role, proposal counter) — dispatch like the existing
// proposals tests do.
function stubProposalUser(opts: { proposalsThisMonthCount: number; suspendedAt?: Date | null }) {
  mocks.userFindUnique.mockImplementation(({ select }: { select: Record<string, true> }) => {
    if (select?.suspendedAt) return Promise.resolve({ suspendedAt: opts.suspendedAt ?? null });
    if (select?.role) return Promise.resolve({ role: "member" });
    return Promise.resolve({
      proposalsThisMonthCount: opts.proposalsThisMonthCount,
      proposalsCounterResetAt: new Date(),
    });
  });
}

describe("POST /api/assistant/inspire/{id}/confirm", () => {
  beforeEach(() => {
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "draft", payload: JSON.stringify(PAYLOAD) });
    mocks.packageUpdate.mockResolvedValue({});
    stubProposalUser({ proposalsThisMonthCount: 0 });
    mocks.listingFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === "l-mine"
          ? { ...listing("l-mine", "u-1"), user: { email: "ana@swapl.test" } }
          : { ...listing(where.id, "u-2"), user: { email: "other@swapl.test" } }
      )
    );
    mocks.proposalCreate.mockResolvedValue({ id: "prop-1" });
  });

  it("creates a REAL proposal via the proposals handler and marks the package confirmed", async () => {
    const res = await confirm(confirmReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, proposalId: "prop-1", packageId: "pkg-1" });

    // The real handler ran: proposal row + monthly counter bump.
    expect(mocks.proposalCreate).toHaveBeenCalledTimes(1);
    const data = mocks.proposalCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ proposerId: "u-1", proposerListingId: "l-mine", targetListingId: "l-a", status: "PENDING" });
    expect(data.message).toBe(PAYLOAD.proposalMessage);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { proposalsThisMonthCount: { increment: 1 } },
    });
    expect(mocks.packageUpdate).toHaveBeenCalledWith({
      where: { id: "pkg-1" },
      data: { status: "confirmed", proposalId: "prop-1" },
    });
  });

  it("works with NO payment at all (no Stripe, no setupIntent): proposal still goes out", async () => {
    const res = await confirm(confirmReq(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.setupIntentRetrieve).not.toHaveBeenCalled();
    expect(mocks.proposalCreate).toHaveBeenCalledTimes(1);
  });

  it("recovers the saved card server-side when the setup_intent webhook hasn't landed yet", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.packageFindUnique.mockResolvedValue({
      id: "pkg-1",
      userId: "u-1",
      status: "draft",
      payload: JSON.stringify(PAYLOAD),
      setupIntentId: "seti_1",
      paymentStatus: "none",
    });
    mocks.setupIntentRetrieve.mockResolvedValue({ status: "succeeded", payment_method: "pm_1" });
    mocks.packageUpdate.mockResolvedValue({ paymentStatus: "saved" });

    const res = await confirm(confirmReq(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).paymentStatus).toBe("saved");
    expect(mocks.packageUpdate).toHaveBeenCalledWith({
      where: { id: "pkg-1" },
      data: { status: "confirmed", proposalId: "prop-1", paymentMethodId: "pm_1", paymentStatus: "saved" },
    });
  });

  it("honours edits: alternative listing, new dates, custom message", async () => {
    const res = await confirm(confirmReq({ listingId: "l-b", dateFrom: "2026-07-12", dateTo: "2026-07-19", message: "Custom note" }), ctx);
    expect(res.status).toBe(200);
    const data = mocks.proposalCreate.mock.calls[0][0].data;
    expect(data.targetListingId).toBe("l-b");
    expect(data.message).toBe("Custom note");
    expect(data.dateFrom).toEqual(new Date("2026-07-12"));
  });

  it("rejects a listing that was never part of the package", async () => {
    const res = await confirm(confirmReq({ listingId: "l-evil" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it("propagates the 402 plan-limit upsell and leaves the package draft", async () => {
    stubProposalUser({ proposalsThisMonthCount: 3 }); // free cap reached
    const res = await confirm(confirmReq(), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).upgradeTo).toBe("plus");
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });

  it("propagates the suspension refusal from the real handler", async () => {
    stubProposalUser({ proposalsThisMonthCount: 0, suspendedAt: new Date() });
    const res = await confirm(confirmReq(), ctx);
    expect(res.status).toBe(403);
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });

  it("404s on someone else's package, 422s when not draft", async () => {
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-9", status: "draft", payload: "{}" });
    expect((await confirm(confirmReq(), ctx)).status).toBe(404);

    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "confirmed", payload: JSON.stringify(PAYLOAD) });
    expect((await confirm(confirmReq(), ctx)).status).toBe(422);
  });
});

// ---------- DOK-148: spoken filters, editable items, pay-on-accept ----------

describe("extractTripFilters (deterministic, no AI key)", () => {
  const NOW = new Date("2026-06-12T00:00:00Z");
  const CITIES = ["Porto", "Lisbon", "New York"];

  it("parses city, month-name date range and constraints from a spoken wish", async () => {
    const f = await extractTripFilters("Take me to Lisbon Sep 5 – 15, somewhere pet-friendly", {
      knownCities: CITIES,
      now: NOW,
    });
    expect(f).toEqual({
      city: "Lisbon",
      dateFrom: "2026-09-05",
      dateTo: "2026-09-15",
      constraints: ["pet-friendly"],
      source: "heuristic",
    });
  });

  it("parses ISO ranges, '5 to 15 September' form and multi-word cities", async () => {
    const iso = await extractTripFilters("New York 2026-09-05 to 2026-09-15 please", { knownCities: CITIES, now: NOW });
    expect(iso).toMatchObject({ city: "New York", dateFrom: "2026-09-05", dateTo: "2026-09-15" });

    const dayFirst = await extractTripFilters("from 5 to 15 September 2026 in porto, need wfh desk", {
      knownCities: CITIES,
      now: NOW,
    });
    expect(dayFirst).toEqual({
      city: "Porto",
      dateFrom: "2026-09-05",
      dateTo: "2026-09-15",
      constraints: ["wfh"],
      source: "heuristic",
    });
  });

  it("rolls a month/day without a year forward to the next occurrence", async () => {
    const f = await extractTripFilters("Porto Feb 3 to 10", { knownCities: CITIES, now: new Date("2026-11-01T00:00:00Z") });
    expect(f).toMatchObject({ dateFrom: "2027-02-03", dateTo: "2027-02-10" });
  });

  it("returns null when nothing is understood", async () => {
    expect(await extractTripFilters("surprise me!", { knownCities: CITIES, now: NOW })).toBeNull();
  });
});

describe("composePackage — spoken filters + editable items", () => {
  it("applies extracted filters to the candidate query and surfaces them as `interpreted`", async () => {
    mocks.listingFindMany.mockImplementation((args: { distinct?: unknown }) =>
      Promise.resolve(
        args?.distinct ? [{ city: "Lisbon" }, { city: "Porto" }] : [listing("l-a", "u-2", { city: "Porto" })]
      )
    );
    const pkg = await composePackage("u-1", { prompt: "Porto 2026-09-05 to 2026-09-15 with the dog" });
    expect(pkg.interpreted).toEqual({
      city: "Porto",
      dateFrom: "2026-09-05",
      dateTo: "2026-09-15",
      constraints: ["pet-friendly"],
      source: "heuristic",
    });
    expect(pkg.dates).toEqual({ from: "2026-09-05", to: "2026-09-15", source: "interpreted" });

    const candidatesCall = mocks.listingFindMany.mock.calls.find((c) => !c[0].distinct)!;
    expect(candidatesCall[0].where.city).toBe("Porto");
    expect(candidatesCall[0].where.availableFrom).toEqual({ lte: new Date("2026-09-15") });
  });

  it("explicit filters always win over the extraction", async () => {
    mocks.listingFindMany.mockImplementation((args: { distinct?: unknown }) =>
      Promise.resolve(args?.distinct ? [{ city: "Lisbon" }, { city: "Porto" }] : [listing("l-a", "u-2")])
    );
    const pkg = await composePackage("u-1", {
      prompt: "Porto 2026-09-05 to 2026-09-15",
      dateFrom: "2026-07-10",
      dateTo: "2026-07-20",
      city: "Lisbon",
    });
    expect(pkg.dates).toEqual({ from: "2026-07-10", to: "2026-07-20", source: "user" });
    const candidatesCall = mocks.listingFindMany.mock.calls.find((c) => !c[0].distinct)!;
    expect(candidatesCall[0].where.city).toBe("Lisbon");
  });

  it("gives every item a stable id + selected:true, and offers only priced flat-fee add-ons", async () => {
    vi.stubEnv("AFF_SKYSCANNER_ID", "sky-1");
    mocks.getDiscoverExperiences.mockResolvedValue([
      { city: "Lisbon", country: "Portugal", title: "Tour", partner: "getyourguide", url: "/api/affiliate/getyourguide?city=Lisbon", photo: null },
    ]);
    mocks.addOnFindMany.mockResolvedValue(ADDON_ROWS);

    const pkg = await composePackage("u-1", {});
    expect(pkg.interpreted).toBeNull();
    expect(pkg.experiences[0]).toMatchObject({ id: "exp-1", selected: true, title: "Tour" });
    expect(pkg.services[0]).toMatchObject({ id: "svc-skyscanner", selected: true });
    expect(pkg.addOns.map((a) => a.id)).toEqual(["addon-cleaning-mid", "addon-city-guide"]);
    expect(pkg.addOns.every((a) => a.selected)).toBe(true);
    expect(mocks.addOnFindMany.mock.calls[0][0].where).toEqual({ isActive: true, type: "flat_fee", priceCents: { gt: 0 } });
    // The persisted draft carries the editable items.
    const saved = JSON.parse(mocks.packageCreate.mock.calls[0][0].data.payload);
    expect(saved.addOns).toHaveLength(2);
  });
});

const ADDON_ROWS = [
  { slug: "cleaning-mid", name: "Pre-stay cleaning", description: "d", priceCents: 6900, currency: "EUR", provider: "swapl", category: "cleaning" },
  { slug: "city-guide", name: "Local city guide", description: "d", priceCents: 900, currency: "EUR", provider: "swapl", category: "guide" },
];

const ITEMS_PAYLOAD = {
  ...PAYLOAD,
  experiences: [
    { city: "Lisbon", country: "Portugal", title: "Tour", partner: "getyourguide", url: "/x", photo: null, id: "exp-1", selected: true },
  ],
  services: [{ slug: "skyscanner", name: "Skyscanner", category: "flights", url: "/y", id: "svc-skyscanner", selected: true }],
  addOns: [
    { id: "addon-cleaning-mid", selected: true, slug: "cleaning-mid", name: "Pre-stay cleaning", description: "d", priceCents: 6900, currency: "EUR", provider: "swapl", category: "cleaning" },
    { id: "addon-city-guide", selected: true, slug: "city-guide", name: "Local city guide", description: "d", priceCents: 900, currency: "EUR", provider: "swapl", category: "guide" },
  ],
  interpreted: null,
};

function itemsReq(body: unknown) {
  return new Request("https://swapl.test/api/assistant/inspire/pkg-1/items", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/assistant/inspire/{id}/items", () => {
  beforeEach(() => {
    mocks.packageFindUnique.mockResolvedValue({
      id: "pkg-1",
      userId: "u-1",
      status: "draft",
      payload: JSON.stringify(ITEMS_PAYLOAD),
    });
    mocks.packageUpdate.mockResolvedValue({});
  });

  it("toggles items, persists the payload, and recomputes the payable total", async () => {
    const res = await patchItems(itemsReq({ items: [{ itemId: "addon-cleaning-mid", selected: false }, { itemId: "exp-1", selected: false }] }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.addOns).toEqual([
      { id: "addon-cleaning-mid", selected: false },
      { id: "addon-city-guide", selected: true },
    ]);
    expect(body.items.experiences).toEqual([{ id: "exp-1", selected: false }]);
    // Only the remaining selected concierge add-on is payable.
    expect(body.payable).toEqual({ totalCents: 900, currency: "EUR" });

    const saved = JSON.parse(mocks.packageUpdate.mock.calls[0][0].data.payload);
    expect(saved.addOns.find((a: { id: string }) => a.id === "addon-cleaning-mid").selected).toBe(false);
  });

  it("accepts the single-toggle shape too", async () => {
    const res = await patchItems(itemsReq({ itemId: "svc-skyscanner", selected: false }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).items.services).toEqual([{ id: "svc-skyscanner", selected: false }]);
  });

  it("rejects unknown item ids without writing", async () => {
    const res = await patchItems(itemsReq({ itemId: "addon-nope", selected: false }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });

  it("404s on someone else's package, 422s when not draft", async () => {
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-9", status: "draft", payload: "{}" });
    expect((await patchItems(itemsReq({ itemId: "exp-1", selected: false }), ctx)).status).toBe(404);

    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "confirmed", payload: JSON.stringify(ITEMS_PAYLOAD) });
    expect((await patchItems(itemsReq({ itemId: "exp-1", selected: false }), ctx)).status).toBe(422);
  });
});

describe("POST /api/assistant/inspire/{id}/checkout", () => {
  const checkoutReq = () =>
    new Request("https://swapl.test/api/assistant/inspire/pkg-1/checkout", { method: "POST" });

  beforeEach(() => {
    mocks.packageFindUnique.mockResolvedValue({
      id: "pkg-1",
      userId: "u-1",
      status: "draft",
      payload: JSON.stringify(ITEMS_PAYLOAD),
      setupIntentId: null,
      paymentStatus: "none",
    });
    mocks.packageUpdate.mockResolvedValue({});
  });

  it("degrades without Stripe: paymentRequired false, no SetupIntent, flow continues", async () => {
    const res = await checkout(checkoutReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentRequired).toBe(false);
    expect(body.summary.totalCents).toBe(7800);
    expect(mocks.setupIntentCreate).not.toHaveBeenCalled();
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });

  it("returns paymentRequired false when nothing payable is selected, even with Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    const payload = {
      ...ITEMS_PAYLOAD,
      addOns: ITEMS_PAYLOAD.addOns.map((a) => ({ ...a, selected: false })),
    };
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "draft", payload: JSON.stringify(payload) });
    const res = await checkout(checkoutReq(), ctx);
    expect((await res.json()).paymentRequired).toBe(false);
    expect(mocks.setupIntentCreate).not.toHaveBeenCalled();
  });

  it("with Stripe + payable items: creates an off_session SetupIntent (NO charge) and saves its id", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.setupIntentCreate.mockResolvedValue({ id: "seti_1", client_secret: "seti_1_secret" });

    const res = await checkout(checkoutReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ paymentRequired: true, clientSecret: "seti_1_secret" });
    expect(body.note).toMatch(/only be charged if the host accepts/i);
    expect(body.summary).toEqual({
      payableItems: [
        { id: "addon-cleaning-mid", slug: "cleaning-mid", name: "Pre-stay cleaning", priceCents: 6900 },
        { id: "addon-city-guide", slug: "city-guide", name: "Local city guide", priceCents: 900 },
      ],
      totalCents: 7800,
      currency: "EUR",
    });
    expect(mocks.setupIntentCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      usage: "off_session",
      metadata: { kind: "inspire_package", packageId: "pkg-1", userId: "u-1" },
    });
    expect(mocks.packageUpdate).toHaveBeenCalledWith({
      where: { id: "pkg-1" },
      data: { setupIntentId: "seti_1", paymentStatus: "none" },
    });
  });

  it("404s on someone else's package, 422s when not draft", async () => {
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-9", status: "draft", payload: "{}" });
    expect((await checkout(checkoutReq(), ctx)).status).toBe(404);

    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "confirmed", payload: "{}" });
    expect((await checkout(checkoutReq(), ctx)).status).toBe(422);
  });
});

describe("POST /api/assistant/inspire/{id}/dismiss", () => {
  it("marks a draft dismissed; refuses non-drafts", async () => {
    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "draft", payload: "{}" });
    mocks.packageUpdate.mockResolvedValue({});
    const res = await dismiss(confirmReq(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.packageUpdate).toHaveBeenCalledWith({ where: { id: "pkg-1" }, data: { status: "dismissed" } });

    mocks.packageFindUnique.mockResolvedValue({ id: "pkg-1", userId: "u-1", status: "confirmed", payload: "{}" });
    expect((await dismiss(confirmReq(), ctx)).status).toBe(422);
  });
});
