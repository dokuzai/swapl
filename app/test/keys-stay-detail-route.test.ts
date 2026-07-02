// GET /api/keys/stays/{id} (JRN-GP-04): the home guide is revealed only to the
// confirmed stay's guest/host, `{ locked: true }` while pending, and null when
// the host never filled one. Mocks the prisma + session + conversation surface.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: { keysStay: { findUnique: mocks.findUnique } },
  parseJSON: <T,>(s: string | null | undefined, fb: T): T => {
    if (!s) return fb;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fb;
    }
  },
}));
vi.mock("@/lib/conversations", () => ({ conversationForKeysStay: vi.fn(async () => ({ id: "conv1" })) }));

import { GET } from "@/app/api/keys/stays/[id]/route";

const guide = {
  accessInstructions: "code 1234",
  keyPickup: "keypad",
  wifiName: "Net",
  wifiPassword: "pw",
  heatingCooling: null,
  kitchen: null,
  bins: null,
  petsPlants: null,
  houseRules: null, // deliberately blank → should serialise to null
  neighbourhood: null,
  emergencyContact: null,
};

function stay(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    guestId: "guest",
    hostId: "host",
    kind: "keys",
    status: "confirmed",
    dateFrom: new Date("2026-07-10"),
    dateTo: new Date("2026-07-17"),
    nights: 7,
    keysCost: 28,
    insurancePolicyId: null,
    listing: {
      id: "L1",
      title: "Flat",
      city: "Lisbon",
      neighbourhood: "Alfama",
      photos: "[]",
      address: "1 Rua A",
      lat: 38.7,
      lng: -9.1,
      user: { id: "host", name: "Host", avatar: null, contactChannels: null },
      homeGuide: guide as Record<string, string | null> | null,
    },
    guest: { id: "guest", name: "Guest", avatar: null, contactChannels: null },
    host: { id: "host", name: "Host", avatar: null, contactChannels: null },
    ...over,
  };
}

function get(userId: string, id = "s1") {
  mocks.getSessionFromRequest.mockResolvedValue(userId ? { userId } : null);
  return GET(new Request(`https://swapl.test/api/keys/stays/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(stay());
});

describe("GET /api/keys/stays/[id] — home guide reveal", () => {
  it("401 without a session", async () => {
    const res = await get("");
    expect(res.status).toBe(401);
  });

  it("gives the confirmed GUEST the full guide (blank fields → null)", async () => {
    const body = await (await get("guest")).json();
    expect(body.homeGuide.accessInstructions).toBe("code 1234");
    expect(body.homeGuide.wifiName).toBe("Net");
    expect(body.homeGuide.houseRules).toBeNull();
    expect(body.homeGuide.locked).toBeUndefined();
    expect(body.listing.address).toBe("1 Rua A"); // address unlocks together
  });

  it("gives the confirmed HOST the guide too (symmetric reveal)", async () => {
    const body = await (await get("host")).json();
    expect(body.homeGuide.wifiPassword).toBe("pw");
  });

  it("hides the guide on a pending stay (locked, and address null)", async () => {
    mocks.findUnique.mockResolvedValue(stay({ status: "pending" }));
    const body = await (await get("guest")).json();
    expect(body.homeGuide).toEqual({ locked: true });
    expect(body.listing.address).toBeNull();
  });

  it("returns null when the host never created a guide", async () => {
    const s = stay();
    s.listing.homeGuide = null;
    mocks.findUnique.mockResolvedValue(s);
    const body = await (await get("guest")).json();
    expect(body.homeGuide).toBeNull();
  });

  it("403s a non-party (no guide leak)", async () => {
    const res = await get("stranger");
    expect(res.status).toBe(403);
  });
});
