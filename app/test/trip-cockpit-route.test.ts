// GET /api/agreements/{id}/trip — the per-party cockpit payload, with strict
// server-side reveal gating: the other home's exact address + guide content are
// withheld until the 48h window (or both guides complete). Completeness
// percentages are always exposed (no content leak).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  agreementFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: { swapAgreement: { findUnique: mocks.agreementFindUnique } },
  // Same contract as the real helper: tolerant parse with a fallback.
  parseJSON: <T,>(s: string | null | undefined, fallback: T): T => {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
}));

import { GET } from "@/app/api/agreements/[id]/trip/route";

const NOW = new Date("2026-06-14T12:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;

const fullGuide = {
  accessInstructions: "a", keyPickup: "b", wifiName: "c", wifiPassword: "d",
  heatingCooling: "e", kitchen: "f", bins: "g", petsPlants: "h",
  houseRules: "rules", neighbourhood: "nbhd", emergencyContact: "112",
};

function agreement(over: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    proposalId: "prop-1",
    status: "ACTIVE",
    dateFrom: new Date(NOW.getTime() + hours(72)), // 3 days out -> locked
    dateTo: new Date(NOW.getTime() + hours(240)),
    keyCode1: "1111",
    keyCode2: "2222",
    insurancePolicy: { policyNumber: "SC-1", coverageAmount: 150000, status: "active", expiresAt: NOW },
    checkEvents: [],
    listing1: {
      userId: "u1", city: "Lisbon", address: "1 Rua A",
      user: { id: "u1", name: "Ana", email: "ana@swapl.test" },
      homeGuide: null,
    },
    listing2: {
      userId: "u2", city: "Berlin", address: "2 Strasse B", lat: 52.5012, lng: 13.4012,
      user: { id: "u2", name: "Ben", email: "ben@swapl.test" },
      homeGuide: fullGuide,
    },
    ...over,
  };
}

function get(userId = "u1", id = "agr-1") {
  mocks.getSessionFromRequest.mockResolvedValue({ userId });
  return GET(new Request(`https://swapl.test/api/agreements/${id}/trip`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.agreementFindUnique.mockResolvedValue(agreement());
});

describe("trip cockpit gating", () => {
  it("403 for a non-party", async () => {
    expect((await get("stranger")).status).toBe(403);
  });

  it("locked far from the stay: address + guide content withheld, completeness still shown", async () => {
    const body = await (await get("u1")).json();
    expect(body.addressUnlocked).toBe(false);
    expect(body.otherAddress).toBeNull();
    expect(body.otherLat).toBeNull();
    expect(body.otherLng).toBeNull();
    expect(body.otherGuide).toEqual({ locked: true, unlocksAt: expect.any(String) });
    // u1's own guide (listing1) is empty -> 0; u2's guide is full -> 100.
    expect(body.myGuideCompleteness).toBe(0);
    expect(body.otherGuideCompleteness).toBe(100);
    expect(body.phase).toBe("PREPARING");
  });

  it("u1 gets their own key code (the code for the home they travel to)", async () => {
    const body = await (await get("u1")).json();
    // u1 is on side 1, travels to listing2 -> keyCode2.
    expect(body.keyCodes.mine).toBe("2222");
  });

  it("unlocked inside 48h: other address + guide content revealed", async () => {
    mocks.agreementFindUnique.mockResolvedValue(agreement({ dateFrom: new Date(NOW.getTime() + hours(24)) }));
    const body = await (await get("u1")).json();
    expect(body.addressUnlocked).toBe(true);
    expect(body.otherAddress).toBe("2 Strasse B");
    expect(body.otherLat).toBe(52.5012);
    expect(body.otherLng).toBe(13.4012);
    expect(body.otherGuide.wifiName).toBe("c");
    expect(body.phase).toBe("READY");
  });

  it("IN_PROGRESS once started with a check-in, and checklist reflects the caller's events", async () => {
    mocks.agreementFindUnique.mockResolvedValue(
      agreement({
        dateFrom: new Date(NOW.getTime() - hours(2)),
        checkEvents: [{ id: "e1", userId: "u1", type: "checkin", note: null, photos: "[]", createdAt: NOW }],
      }),
    );
    const body = await (await get("u1")).json();
    expect(body.phase).toBe("IN_PROGRESS");
    expect(body.checklist.checkedIn).toBe(true);
    expect(body.checkEvents[0].mine).toBe(true);
  });
});
