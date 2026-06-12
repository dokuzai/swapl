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
  proposalCreate: vi.fn(),
  orgMemberFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  getDiscoverExperiences: vi.fn(),
  sendEmail: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    listing: { findFirst: mocks.listingFindFirst, findMany: mocks.listingFindMany, findUnique: mocks.listingFindUnique },
    favorite: { findMany: mocks.favoriteFindMany },
    travelProfile: { findUnique: mocks.profileFindUnique },
    inspirationPackage: { create: mocks.packageCreate, findUnique: mocks.packageFindUnique, update: mocks.packageUpdate },
    swapProposal: { create: mocks.proposalCreate },
    organizationMember: { findFirst: mocks.orgMemberFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
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

import { composePackage, InspireError } from "@/lib/ai/inspire";
import { POST as inspire } from "@/app/api/assistant/inspire/route";
import { POST as confirm } from "@/app/api/assistant/inspire/[id]/confirm/route";
import { POST as dismiss } from "@/app/api/assistant/inspire/[id]/dismiss/route";

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
  for (const k of [...AI_ENVS, ...AFF_ENVS]) vi.stubEnv(k, "");
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
