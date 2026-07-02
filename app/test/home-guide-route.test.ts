// GET/PUT /api/listings/{id}/home-guide — owner read/write, and the strict
// server-side reveal gate for the counterparty (locked before 48h / unless
// both guides complete; content only after). Prisma + session mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto"; // SWP-007: wifi stored encrypted

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  listingFindUnique: vi.fn(),
  agreementFindFirst: vi.fn(),
  guideUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: mocks.listingFindUnique },
    swapAgreement: { findFirst: mocks.agreementFindFirst },
    listingHomeGuide: { upsert: mocks.guideUpsert },
  },
}));

import { GET, PUT } from "@/app/api/listings/[id]/home-guide/route";

const NOW = new Date("2026-06-14T12:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;

const fullGuide = {
  accessInstructions: "a",
  keyPickup: "b",
  wifiName: "c",
  wifiPassword: encryptSecret("d"),
  heatingCooling: "e",
  kitchen: "f",
  bins: "g",
  petsPlants: "h",
  houseRules: null,
  neighbourhood: null,
  emergencyContact: null,
  updatedAt: NOW,
};

function get(id = "listing-1") {
  return GET(new Request(`https://swapl.test/api/listings/${id}/home-guide`), {
    params: Promise.resolve({ id }),
  });
}
function put(id: string, body: unknown) {
  return PUT(
    new Request(`https://swapl.test/api/listings/${id}/home-guide`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "owner-1" });
  mocks.listingFindUnique.mockResolvedValue({ id: "listing-1", userId: "owner-1", homeGuide: fullGuide });
  mocks.guideUpsert.mockImplementation(async ({ create, update }: { create?: object; update?: object }) => ({
    ...fullGuide,
    ...(create ?? {}),
    ...(update ?? {}),
  }));
});

describe("GET home-guide (owner)", () => {
  it("401 when unauthenticated", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("owner reads their own guide with completeness", async () => {
    const res = await get();
    const body = await res.json();
    expect(body.isOwner).toBe(true);
    expect(body.locked).toBe(false);
    expect(body.guide.completeness).toBe(100);
    expect(body.guide.complete).toBe(true);
  });

  it("404 when the listing does not exist", async () => {
    mocks.listingFindUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
});

describe("GET home-guide (non-owner reveal gating)", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "guest-1" });
  });

  it("403 when no active agreement ties the caller to the listing", async () => {
    mocks.agreementFindFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(403);
  });

  it("locked (no content) before the 48h window and guides incomplete", async () => {
    mocks.agreementFindFirst.mockResolvedValue({
      dateFrom: new Date(NOW.getTime() + hours(72)),
      status: "ACTIVE",
      listing1: { homeGuide: null },
      listing2: { homeGuide: null },
    });
    const body = await (await get()).json();
    expect(body.locked).toBe(true);
    expect(body.guide).toBeNull();
    expect(typeof body.unlocksAt).toBe("string");
  });

  it("unlocked once inside the 48h window — returns guide content", async () => {
    mocks.agreementFindFirst.mockResolvedValue({
      dateFrom: new Date(NOW.getTime() + hours(24)),
      status: "ACTIVE",
      listing1: { homeGuide: null },
      listing2: { homeGuide: null },
    });
    const body = await (await get()).json();
    expect(body.locked).toBe(false);
    expect(body.guide.wifiName).toBe("c");
  });

  it("unlocked early when both guides are complete, even far from the stay", async () => {
    mocks.agreementFindFirst.mockResolvedValue({
      dateFrom: new Date(NOW.getTime() + hours(240)),
      status: "ACTIVE",
      listing1: { homeGuide: fullGuide },
      listing2: { homeGuide: fullGuide },
    });
    const body = await (await get()).json();
    expect(body.locked).toBe(false);
    expect(body.guide.accessInstructions).toBe("a");
  });
});

describe("PUT home-guide", () => {
  it("403 for a non-owner", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "guest-1" });
    expect((await put("listing-1", { wifiName: "x" })).status).toBe(403);
  });

  it("owner partial upsert writes only provided keys", async () => {
    const res = await put("listing-1", { wifiName: "new-net", keyPickup: "lockbox" });
    expect(res.status).toBe(200);
    const arg = mocks.guideUpsert.mock.calls[0][0];
    expect(arg.update).toEqual({ wifiName: "new-net", keyPickup: "lockbox" });
    expect(arg.create.listingId).toBe("listing-1");
  });

  it("rejects invalid field types", async () => {
    expect((await put("listing-1", { wifiName: 123 })).status).toBe(400);
  });

  it("encrypts the wifi password at rest on write (SWP-007)", async () => {
    await put("listing-1", { wifiPassword: "sunset2026" });
    const written = mocks.guideUpsert.mock.calls[0][0].update.wifiPassword as string;
    expect(isEncrypted(written)).toBe(true);
    expect(written).not.toContain("sunset2026");
    expect(decryptSecret(written)).toBe("sunset2026");
  });
});
