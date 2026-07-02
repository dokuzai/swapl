// GET /api/proposals — mobile inbox summaries. Verifies the my*/their* fields
// stay oriented to the caller's side and that each side carries the cover
// photo (first entry of the listing's JSON-encoded `photos` array, or null).

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-me", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  proposalFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapProposal: { findMany: mocks.proposalFindMany },
    user: { findMany: mocks.userFindMany },
    // DOK-221 unread cursors: the inbox reads per-conversation read state and
    // groups unread messages per proposal.
    conversationRead: { findMany: vi.fn(async () => []) },
    swapMessage: { groupBy: vi.fn(async () => []) },
  },
  // Same contract as the real helper: tolerant parse with a fallback.
  parseJSON: <T>(s: string | null | undefined, fallback: T): T => {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailTemplates: { proposalReceived: vi.fn(() => ({})) } }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(), pushTemplates: { proposalReceived: vi.fn(() => ({})) } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ ok: true })) }));

import { GET } from "@/app/api/proposals/route";

const myListing = {
  id: "l-mine",
  city: "Milan",
  neighbourhood: "Isola",
  paletteHint: null,
  photos: JSON.stringify(["https://cdn.swapl.test/mine-1.jpg", "https://cdn.swapl.test/mine-2.jpg"]),
};
const theirListing = {
  id: "l-theirs",
  city: "Lisbon",
  neighbourhood: "Alfama",
  userId: "u-other",
  paletteHint: null,
  photos: JSON.stringify(["https://cdn.swapl.test/theirs-1.jpg"]),
};

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop-1",
    status: "PENDING",
    proposerId: "u-me",
    message: null,
    dateFrom: new Date("2026-07-01"),
    dateTo: new Date("2026-07-08"),
    updatedAt: new Date("2026-06-10T12:00:00Z"),
    proposerListing: myListing,
    targetListing: theirListing,
    proposer: { id: "u-me", name: "Ana" },
    ...overrides,
  };
}

function get() {
  return GET(new Request("https://swapl.test/api/proposals"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.userFindMany.mockResolvedValue([{ id: "u-other", name: "Ben" }]);
});

describe("GET /api/proposals", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("includes cover photos for both sides when I am the proposer", async () => {
    mocks.proposalFindMany.mockResolvedValue([proposal()]);
    const res = await get();
    expect(res.status).toBe(200);
    const { buckets } = await res.json();
    const item = buckets.sent[0];
    expect(item.myCity).toBe("Milan");
    expect(item.myCoverPhotoUrl).toBe("https://cdn.swapl.test/mine-1.jpg");
    expect(item.theirCity).toBe("Lisbon");
    expect(item.theirCoverPhotoUrl).toBe("https://cdn.swapl.test/theirs-1.jpg");
  });

  it("swaps the sides when I am the target", async () => {
    mocks.proposalFindMany.mockResolvedValue([
      proposal({
        proposerId: "u-other",
        proposer: { id: "u-other", name: "Ben" },
        proposerListing: { ...myListing, id: "l-theirs-2", city: "Lisbon", photos: theirListing.photos },
        targetListing: { ...theirListing, id: "l-mine-2", city: "Milan", userId: "u-me", photos: myListing.photos },
      }),
    ]);
    const res = await get();
    const { buckets } = await res.json();
    const item = buckets.waitingOnYou[0];
    expect(item.meSide).toBe("target");
    expect(item.myCity).toBe("Milan");
    expect(item.myCoverPhotoUrl).toBe("https://cdn.swapl.test/mine-1.jpg");
    expect(item.theirCity).toBe("Lisbon");
    expect(item.theirCoverPhotoUrl).toBe("https://cdn.swapl.test/theirs-1.jpg");
  });

  it("returns null cover photos for listings without photos", async () => {
    mocks.proposalFindMany.mockResolvedValue([
      proposal({
        proposerListing: { ...myListing, photos: "[]" },
        targetListing: { ...theirListing, photos: "not-json" },
      }),
    ]);
    const res = await get();
    const { buckets } = await res.json();
    const item = buckets.sent[0];
    expect(item.myCoverPhotoUrl).toBeNull();
    expect(item.theirCoverPhotoUrl).toBeNull();
  });
});
