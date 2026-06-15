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
  classifyPropertyDocument: vi.fn(),
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
vi.mock("@/lib/ai/property-doc", () => ({
  classifyPropertyDocument: mocks.classifyPropertyDocument,
}));
// nightlyKeysFor + geocode helpers are pure; keep the real ones.

import { POST as createListing } from "@/app/api/listings/route";
import {
  GET as pvGet,
  POST as pvPost,
} from "@/app/api/listings/[id]/property-verification/route";
import { GET as adminQueue } from "@/app/api/admin/property-verifications/route";
import { POST as adminReview } from "@/app/api/admin/property-verifications/[id]/route";
import { ackLogTextForMode, PUBLISH_ACK_VERSION } from "@/lib/listing/publish-ack";

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
  // Default: AI disabled (no key / not vision-capable) → DOK-162 manual review.
  mocks.classifyPropertyDocument.mockResolvedValue({
    classification: "uncertain",
    confidence: 0,
    entityType: "unknown",
    reasons: [],
    aiDisabled: true,
    source: "disabled",
  });
});

// Default property-verification row shape (now with the DOK-186 ai* fields).
function pvRow(over: Record<string, unknown> = {}) {
  return {
    id: "pv-1",
    status: "pending",
    documents: JSON.stringify([{ url: "https://x.test/deed.pdf", label: "Deed" }]),
    note: null,
    aiClassification: null,
    aiConfidence: null,
    aiReasons: null,
    aiEntityType: null,
    documentType: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

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
        ackText: ackLogTextForMode("entire_home_while_away"),
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
    mocks.listingFindUnique.mockResolvedValue({
      id: "l-1",
      userId: "u-owner",
      title: "Flat",
      city: "Amsterdam",
      country: "Netherlands",
      user: { name: "Owner" },
    });
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.pvCreate.mockResolvedValue(pvRow());
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
    // AI disabled → no ai* persisted, no listing side effect.
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.pvCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          aiClassification: null,
          documentType: null,
        }),
      })
    );
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
    // DOK-186: approving also clears any AI business-ineligible flag.
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { ownerVerified: true, ineligibleReason: null, ineligibleAt: null },
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

  it("409 when reviewing a verification that is ALREADY approved", async () => {
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

  it("admin override can APPROVE an AI-rejected (business) verification (DOK-186)", async () => {
    mocks.pvFindUnique.mockResolvedValue({ id: "pv-1", listingId: "l-1", status: "rejected" });
    mocks.pvUpdate.mockResolvedValue({ id: "pv-1", status: "approved" });
    const res = await adminReview(
      new Request("https://swapl.test/api/admin/property-verifications/pv-1", {
        method: "POST",
        body: JSON.stringify({ decision: "approve", note: "verified manually" }),
      }),
      { params: Promise.resolve({ id: "pv-1" }) }
    );
    expect(res.status).toBe(200);
    // Restores the listing: owner badge on, ineligible flag cleared.
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { ownerVerified: true, ineligibleReason: null, ineligibleAt: null },
    });
  });
});

// ---- DOK-186: AI property-document analysis drives the submission outcome ----
describe("property-verification AI outcome (DOK-186)", () => {
  function submitReq(body: unknown) {
    return new Request("https://swapl.test/api/listings/l-1/property-verification", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  const ownerListing = {
    id: "l-1",
    userId: "u-owner",
    title: "Flat",
    city: "Amsterdam",
    country: "Netherlands",
    user: { name: "Owner" },
  };

  it("confident BUSINESS → reject + mark listing ineligible (business_property)", async () => {
    mocks.listingFindUnique.mockResolvedValue(ownerListing);
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.classifyPropertyDocument.mockResolvedValue({
      classification: "business",
      confidence: 0.95,
      entityType: "company",
      reasons: ["VAT number present", "registered company name"],
      source: "ai",
    });
    mocks.pvCreate.mockResolvedValue(pvRow({ status: "rejected", aiClassification: "business" }));
    const res = await pvPost(submitReq({ documents: [{ url: "https://x.test/a.jpg", label: "Deed" }] }), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).verification.status).toBe("rejected");
    expect(mocks.pvCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "rejected" }) })
    );
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: expect.objectContaining({ ineligibleReason: "business_property" }),
    });
  });

  it("low-confidence BUSINESS stays pending, no listing flag", async () => {
    mocks.listingFindUnique.mockResolvedValue(ownerListing);
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.classifyPropertyDocument.mockResolvedValue({
      classification: "business",
      confidence: 0.4,
      entityType: "unknown",
      reasons: [],
      source: "ai",
    });
    mocks.pvCreate.mockResolvedValue(pvRow());
    const res = await pvPost(submitReq({ documents: [{ url: "https://x.test/a.jpg", label: "Deed" }] }), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(201);
    expect(mocks.pvCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) })
    );
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("private_owner → eligible but PENDING by default (AI proposes, admin confirms)", async () => {
    mocks.listingFindUnique.mockResolvedValue(ownerListing);
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.classifyPropertyDocument.mockResolvedValue({
      classification: "private_owner",
      confidence: 0.97,
      entityType: "person",
      reasons: ["individual named on deed"],
      source: "ai",
    });
    mocks.pvCreate.mockResolvedValue(pvRow({ aiClassification: "private_owner" }));
    const res = await pvPost(submitReq({ documents: [{ url: "https://x.test/a.jpg", label: "Deed" }] }), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(201);
    expect(mocks.pvCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) })
    );
    // Default-safe: no auto ownerVerified.
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("private_tenant → eligible, PENDING, never sets ownerVerified", async () => {
    mocks.listingFindUnique.mockResolvedValue(ownerListing);
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.classifyPropertyDocument.mockResolvedValue({
      classification: "private_tenant",
      confidence: 0.96,
      entityType: "person",
      reasons: ["lease names an individual tenant"],
      source: "ai",
    });
    mocks.pvCreate.mockResolvedValue(pvRow({ aiClassification: "private_tenant" }));
    const res = await pvPost(submitReq({ documents: [{ url: "https://x.test/a.jpg", label: "Lease" }] }), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(201);
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("does NOT persist PII beyond classification/entityType/bounded reasons", async () => {
    mocks.listingFindUnique.mockResolvedValue(ownerListing);
    mocks.pvFindFirst.mockResolvedValue(null);
    mocks.classifyPropertyDocument.mockResolvedValue({
      classification: "private_owner",
      confidence: 0.9,
      entityType: "person",
      ownerName: "Jane Doe",
      reasons: ["individual named on deed"],
      source: "ai",
    });
    mocks.pvCreate.mockResolvedValue(pvRow());
    await pvPost(submitReq({ documents: [{ url: "https://x.test/a.jpg", label: "Deed" }] }), {
      params: Promise.resolve({ id: "l-1" }),
    });
    const persisted = mocks.pvCreate.mock.calls[0][0].data;
    // Whitelist of persisted ai* fields — ownerName / document content never land in the row.
    expect(persisted).not.toHaveProperty("ownerName");
    expect(JSON.stringify(persisted)).not.toContain("Jane Doe");
    expect(persisted.aiClassification).toBe("private_owner");
    expect(persisted.aiEntityType).toBe("person");
  });
});
