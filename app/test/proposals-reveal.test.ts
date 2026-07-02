// GET /api/proposals/[id] — the exact-location reveal gate. A party always sees
// their OWN home's exact address + pin; the OTHER home's exact location is
// withheld (address null, coords fuzzed) until the swap reveal gate opens, then
// revealed. Real toDTO + real guideUnlocked run; only I/O is mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto"; // SWP-007: key codes stored encrypted

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  proposalFindUnique: vi.fn(),
  proposalUpdate: vi.fn(),
  reviewFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapProposal: { findUnique: mocks.proposalFindUnique, update: mocks.proposalUpdate },
    swapReview: { findUnique: mocks.reviewFindUnique },
    // DOK-221: GET /proposals/[id] lazily upserts the per-proposal conversation.
    conversation: { upsert: vi.fn(async () => ({ id: "conv_1" })) },
  },
  // toDTO (real) pulls parseJSON from here.
  parseJSON: <T,>(v: string | null, fallback: T): T => {
    if (!v) return fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  },
}));
// Modules imported by the route but only exercised on the POST path.
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailTemplates: {} }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(), pushTemplates: {} }));
vi.mock("@/lib/insurance", () => ({ insuranceProvider: {} }));
vi.mock("@/lib/insurance/anchor", () => ({ anchorIssuedPolicy: vi.fn() }));
vi.mock("@/lib/billing/inspire", () => ({
  chargeInspirePackageOnAccept: vi.fn(),
  cancelInspirePackagePayment: vi.fn(),
}));
vi.mock("@/lib/listing/availability", () => ({ bookedRangesFor: vi.fn(), rangesOverlap: vi.fn() }));
vi.mock("@/lib/listing/occupancy", () => ({ isListingDateOverlapError: vi.fn(), occupyListing: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }));

import { GET, POST } from "@/app/api/proposals/[id]/route";

const NOW = new Date("2026-07-01T12:00:00Z");
const EXACT = { lat: 41.0123, lng: 28.9456 };

function makeListing(over: Record<string, unknown>) {
  return {
    id: "l",
    title: "Flat",
    description: "d",
    propertyType: "APARTMENT",
    city: "Istanbul",
    neighbourhood: "Ayvansaray",
    country: "Türkiye",
    sizeSqm: 70,
    sleeps: 4,
    address: "10 Real Street",
    lat: EXACT.lat,
    lng: EXACT.lng,
    availableFrom: NOW,
    availableTo: NOW,
    minStayDays: 3,
    maxStayDays: 30,
    homeGuide: null,
    ...over,
  };
}

function proposal(dateFrom: Date) {
  return {
    id: "p-1",
    proposerId: "u1",
    status: "ACCEPTED",
    dateFrom: NOW,
    dateTo: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    proposerListing: makeListing({
      id: "l-mine",
      userId: "u1",
      user: { id: "u1", name: "Ana" },
    }),
    targetListing: makeListing({
      id: "l-theirs",
      userId: "u2",
      city: "Berlin",
      user: { id: "u2", name: "Ben" },
    }),
    agreement: {
      id: "a-1",
      dateFrom,
      dateTo: NOW,
      status: "ACCEPTED",
      keyCode1: encryptSecret("1111"),
      keyCode2: encryptSecret("2222"),
      insurancePolicy: null,
      checkEvents: [],
    },
  };
}

function get(userId = "u1") {
  mocks.getSessionFromRequest.mockResolvedValue({ userId });
  return GET(new Request("https://swapl.test/api/proposals/p-1"), {
    params: Promise.resolve({ id: "p-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.reviewFindUnique.mockResolvedValue(null);
});

describe("proposal exact-location reveal gate", () => {
  it("before the gate: own home exact, other home address null + coords fuzzed", async () => {
    // dateFrom 10 days out, guides incomplete -> locked.
    mocks.proposalFindUnique.mockResolvedValue(proposal(new Date(NOW.getTime() + 10 * 864e5)));
    const body = await (await get("u1")).json();

    // u1 owns the proposer listing -> exact.
    expect(body.proposerListing.address).toBe("10 Real Street");
    expect(body.proposerListing.lat).toBe(EXACT.lat);
    // The other (target) listing is gated.
    expect(body.targetListing.address).toBeNull();
    expect(body.targetListing.lat).not.toBe(EXACT.lat);
    expect(body.targetListing.lat).not.toBeNull();
  });

  it("after the gate opens (inside 48h): the other home's exact address + pin are revealed", async () => {
    mocks.proposalFindUnique.mockResolvedValue(proposal(new Date(NOW.getTime() + 24 * 36e5)));
    const body = await (await get("u1")).json();

    expect(body.targetListing.address).toBe("10 Real Street");
    expect(body.targetListing.lat).toBe(EXACT.lat);
    expect(body.targetListing.lng).toBe(EXACT.lng);
  });
});

describe("proposal per-party archive", () => {
  function archivableProposal() {
    return {
      id: "p-1", proposerId: "u1", status: "PENDING", agreement: null,
      proposerListing: { userId: "u1", user: {} },
      targetListing: { userId: "u2", user: {} },
    };
  }
  function post(userId: string, action: string) {
    mocks.getSessionFromRequest.mockResolvedValue({ userId });
    mocks.proposalUpdate.mockResolvedValue({});
    return POST(
      new Request("https://swapl.test/api/proposals/p-1", { method: "POST", body: JSON.stringify({ action }) }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
  }

  it("archive sets only the caller's side flag (proposer)", async () => {
    mocks.proposalFindUnique.mockResolvedValue(archivableProposal());
    const res = await post("u1", "archive");
    expect(res.status).toBe(200);
    const upd = (mocks.proposalUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(upd.data.proposerArchivedAt).toBeInstanceOf(Date);
    expect("targetArchivedAt" in upd.data).toBe(false);
  });

  it("the target archiving touches only the target flag", async () => {
    mocks.proposalFindUnique.mockResolvedValue(archivableProposal());
    await post("u2", "archive");
    const upd = (mocks.proposalUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(upd.data.targetArchivedAt).toBeInstanceOf(Date);
    expect("proposerArchivedAt" in upd.data).toBe(false);
  });

  it("unarchive clears the caller's flag", async () => {
    mocks.proposalFindUnique.mockResolvedValue(archivableProposal());
    await post("u1", "unarchive");
    const upd = (mocks.proposalUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(upd.data.proposerArchivedAt).toBeNull();
  });

  it("a non-party cannot archive", async () => {
    mocks.proposalFindUnique.mockResolvedValue(archivableProposal());
    expect((await post("stranger", "archive")).status).toBe(403);
  });
});
