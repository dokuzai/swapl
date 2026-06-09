import { describe, expect, it } from "vitest";
import {
  betaSignupSchema,
  credentialsSchema,
  deviceRegisterSchema,
  listingCreateSchema,
  swapProposalSchema,
  tokenIssueSchema,
} from "@/lib/validators";
import { PROPERTY_TYPES } from "@/lib/types";

describe("credentialsSchema", () => {
  it("accepts a valid email and password", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.com", password: "secret1" }).success).toBe(true);
  });

  it("rejects a password shorter than 6 characters", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.com", password: "12345" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(credentialsSchema.safeParse({ email: "not-an-email", password: "secret1" }).success).toBe(false);
  });
});

describe("betaSignupSchema", () => {
  it("requires a valid email", () => {
    expect(betaSignupSchema.safeParse({ email: "x@y.io" }).success).toBe(true);
    expect(betaSignupSchema.safeParse({ email: "x" }).success).toBe(false);
  });
});

describe("tokenIssueSchema", () => {
  it("accepts a supported mobile platform", () => {
    expect(
      tokenIssueSchema.safeParse({ email: "a@b.com", password: "secret1", platform: "ios" }).success,
    ).toBe(true);
  });

  it("rejects an unsupported platform", () => {
    expect(
      tokenIssueSchema.safeParse({ email: "a@b.com", password: "secret1", platform: "windows" }).success,
    ).toBe(false);
  });
});

describe("deviceRegisterSchema", () => {
  it("rejects a push token that is too short", () => {
    expect(deviceRegisterSchema.safeParse({ platform: "ios", pushToken: "short" }).success).toBe(false);
  });
});

describe("swapProposalSchema", () => {
  it("coerces ISO date strings to Date instances", () => {
    const parsed = swapProposalSchema.parse({
      proposerListingId: "listing-a",
      targetListingId: "listing-b",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-10",
    });
    expect(parsed.dateFrom).toBeInstanceOf(Date);
    expect(parsed.dateTo).toBeInstanceOf(Date);
  });

  it("rejects empty listing ids", () => {
    expect(
      swapProposalSchema.safeParse({
        proposerListingId: "",
        targetListingId: "listing-b",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-10",
      }).success,
    ).toBe(false);
  });
});

describe("listingCreateSchema", () => {
  const validInput = {
    title: "Cosy canal-side flat",
    description: "A lovely, light-filled place to stay for a while in the city centre.",
    propertyType: PROPERTY_TYPES[0],
    city: "Amsterdam",
    neighbourhood: "Jordaan",
    country: "Netherlands",
    sizeSqm: 75,
    sleeps: 3,
    bedrooms: 2,
    bathrooms: 1,
    availableFrom: "2026-06-01",
    availableTo: "2026-09-01",
  };

  it("accepts a minimal valid listing and applies defaults", () => {
    const result = listingCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minStayDays).toBe(3);
      expect(result.data.maxStayDays).toBe(30);
      expect(result.data.hasElevator).toBe(false);
      expect(result.data.photos).toEqual([]);
    }
  });

  it("rejects a too-short title", () => {
    expect(listingCreateSchema.safeParse({ ...validInput, title: "ab" }).success).toBe(false);
  });

  it("rejects an out-of-range size", () => {
    expect(listingCreateSchema.safeParse({ ...validInput, sizeSqm: 5 }).success).toBe(false);
  });
});
