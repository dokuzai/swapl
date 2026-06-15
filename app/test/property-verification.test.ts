// DOK-162 — optional owner verification + host publish acknowledgment.
//
// Covers:
//   - POST /api/listings requires the publish ack (400 without ackAccepted/mode;
//     ok WITH ack, and a ListingPublishAck row is written with the canonical
//     text + version).
//   - POST/GET /api/listings/[id]/property-verification is owner-only.
//   - GET /api/admin/property-verifications (queue) is admin-gated + filterable.
//   - POST /api/admin/property-verifications/[id] approve -> ownerVerified true;
//     reject -> status rejected, ownerVerified untouched.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  requireAdminFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  listingFindUnique: vi.fn(),
  listingCreate: vi.fn(),
  listingUpdate: vi.fn(),
  publishAckCreate: vi.fn(),
  pvFindUnique: vi.fn(),
  pvFindFirst: vi.fn(),
  pvFindMany: vi.fn(),
  pvCreate: vi.fn(),
  pvUpdate: vi.fn(),
  ensureCanCreateListing: vi.fn(),
  generateCityArt: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));
vi.mock("@/lib/auth/abilities", () => ({
  requireAdminFromRequest: mocks.requireAdminFromRequest,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    listing: {
      findUnique: mocks.listingFindUnique,
      create: mocks.listingCreate,
      update: mocks.listingUpdate,
    },
    listingPublishAck: { create: mocks.publishAckCreate },
    propertyVerification: {
      findUnique: mocks.pvFindUnique,
      findFirst: mocks.pvFindFirst,
      findMany: mocks.pvFindMany,
      create: mocks.pvCreate,
      update: mocks.pvUpdate,
    },
  },
}));
vi.mock("@/lib/billing/limits", () => ({
  ensureCanCreateListing: mocks.ensureCanCreateListing,
  PlanLimitError: class PlanLimitError extends Error {},
}));
vi.mock("@/lib/ai/city-illustration", () => ({
  generateCityArt: mocks.generateCityArt,
}));
// nightlyKeysFor + geocode helpers are pure; keep the real ones.

import { POST as createListing } from "@/app/api/listings/route";
import {
  GET as pvGet,
  POST as pvPost,
} from "@/app/api/listings/[id]/property-verification/route";
import { GET as adminQueue } from "@/app/api/admin/property-verifications/route";
import { POST as adminReview } from "@/app/api/admin/property-verifications/[id]/route";
import { ACK_ENTIRE_HOME, PUBLISH_ACK_VERSION } from "@/lib/listing/publish-ack";

const owner = { userId: "u-owner" };
const admin = { id: "admin-1", email: "ops@swapl.test", name: "Ops", role: "swapl_admin" };

function validDraft() {
  return {
    title: "Sunny flat by the canal",
    description: "A bright two-bedroom apartment a short walk from the centre.",
    propertyType: "APARTMENT",
    city: "Amsterdam",
    neighbourhood: "Jordaan",
    country: "Netherlands",
    sizeSqm: 70,
    sleeps: 3,
    bedrooms: 2,
    bathrooms: 1,
    availableFrom: "2026-09-01",
    availableTo: "2026-09-30",
    minStayDays: 3,
    maxStayDays: 30,
    photos: [],
    tags: [],
  };
}

function createReq(body: unknown) {
  return new Request("https://swapl.test/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(owner);
  mocks.requireAdminFromRequest.mockResolvedValue(admin);
  mocks.userFindUnique.mockResolvedValue({
    emailVerifiedAt: new Date(),
    aiProvider: null,
    aiModel: null,
    aiApiKey: null,
  });
  mocks.ensureCanCreateListing.mockResolvedValue(undefined);
  mocks.generateCityArt.mockResolvedValue({ palette: "p", motif: [], postcard: {} });
  mocks.listingCreate.mockResolvedValue({ id: "l-new" });
  mocks.publishAckCreate.mockResolvedValue({ id: "ack-1" });
});

describe("POST /api/listings publish acknowledgment (DOK-162)", () => {
  it("400 when the acknowledgment is missing", async () => {
    const res = await createListing(createReq(validDraft()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("PUBLISH_ACK_REQUIRED");
    expect(mocks.listingCreate).not.toHaveBeenCalled();
    expect(mocks.publishAckCreate).not.toHaveBeenCalled();
  });

  it("400 when ackAccepted is true but mode is invalid", async () => {
    const res = await createListing(createReq({ ...validDraft(), ackAccepted: true, mode: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("PUBLISH_ACK_REQUIRED");
    expect(mocks.listingCreate).not.toHaveBeenCalled();
  });

  it("creates the listing AND logs a ListingPublishAck row when the ack is present", async () => {
    const res = await createListing(
      createReq({ ...validDraft(), ackAccepted: true, mode: "entire_home_while_away" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "l-new" });

    expect(mocks.publishAckCreate).toHaveBeenCalledTimes(1);
    expect(mocks.publishAckCreate).toHaveBeenCalledWith({
      data: {
        listingId: "l-new",
        userId: "u-owner",
        ackText: ACK_ENTIRE_HOME,
        version: PUBLISH_ACK_VERSION,
        mode: "entire_home_while_away",
      },
    });
  });
});

describe("property-verification (owner only)", () => {
  it("POST 403 when the caller is not the owner", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", userId: "someone-else" });
    const res = await pvPost(
      new Request("https://swapl.test/api/listings/l-1/property-verification", {
        method: "POST",
        body: JSON.stringify({ documents: [{ url: "https://x.test/deed.pdf", label: "Deed" }] }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(403);
    expect(mocks.pvCreate).not.toHaveBeenCalled();
  });

  it("POST 201 creates a pending verification for the owner", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", userId: "u-owner" });
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.pvCreate.mockResolvedValue({
      id: "pv-1",
      status: "pending",
      documents: JSON.stringify([{ url: "https://x.test/deed.pdf", label: "Deed" }]),
      note: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    });
    const res = await pvPost(
      new Request("https://swapl.test/api/listings/l-1/property-verification", {
        method: "POST",
        body: JSON.stringify({ documents: [{ url: "https://x.test/deed.pdf", label: "Deed" }] }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.verification.status).toBe("pending");
    expect(json.verification.documents).toEqual([{ url: "https://x.test/deed.pdf", label: "Deed" }]);
  });

  it("GET 403 for a non-owner", async () => {
    mocks.listingFindUnique.mockResolvedValue({ id: "l-1", userId: "other", ownerVerified: false });
    const res = await pvGet(
      new Request("https://swapl.test/api/listings/l-1/property-verification"),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(403);
  });
});

describe("admin property-verification queue + review", () => {
  it("GET 403 for a non-admin", async () => {
    mocks.requireAdminFromRequest.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const res = await adminQueue(
      new Request("https://swapl.test/api/admin/property-verifications")
    );
    expect(res.status).toBe(403);
  });

  it("GET filters the queue by status", async () => {
    mocks.pvFindMany.mockResolvedValue([
      {
        id: "pv-1",
        status: "pending",
        documents: "[]",
        note: null,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
        listing: { id: "l-1", title: "Flat", city: "A", country: "B", ownerVerified: false },
        user: { id: "u-owner", name: "O", email: "o@x.test" },
      },
    ]);
    const res = await adminQueue(
      new Request("https://swapl.test/api/admin/property-verifications?status=pending")
    );
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
    expect(mocks.pvFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } })
    );
  });

  it("approve sets status approved AND flips Listing.ownerVerified = true", async () => {
    mocks.pvFindUnique.mockResolvedValue({ id: "pv-1", listingId: "l-1", status: "pending" });
    mocks.pvUpdate.mockResolvedValue({ id: "pv-1", status: "approved" });
    const res = await adminReview(
      new Request("https://swapl.test/api/admin/property-verifications/pv-1", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
      { params: Promise.resolve({ id: "pv-1" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "approved" });
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { ownerVerified: true },
    });
  });

  it("reject sets status rejected and does NOT touch ownerVerified", async () => {
    mocks.pvFindUnique.mockResolvedValue({ id: "pv-1", listingId: "l-1", status: "pending" });
    mocks.pvUpdate.mockResolvedValue({ id: "pv-1", status: "rejected" });
    const res = await adminReview(
      new Request("https://swapl.test/api/admin/property-verifications/pv-1", {
        method: "POST",
        body: JSON.stringify({ decision: "reject", note: "blurry" }),
      }),
      { params: Promise.resolve({ id: "pv-1" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "rejected" });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("409 when reviewing a verification that is not pending", async () => {
    mocks.pvFindUnique.mockResolvedValue({ id: "pv-1", listingId: "l-1", status: "approved" });
    const res = await adminReview(
      new Request("https://swapl.test/api/admin/property-verifications/pv-1", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
      { params: Promise.resolve({ id: "pv-1" }) }
    );
    expect(res.status).toBe(409);
  });
});
