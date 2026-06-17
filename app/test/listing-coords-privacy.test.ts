// Privacy contract for listing coordinates: the exact lat/lng a host captured
// via "use my current location" is stored, but toDTO only reveals it to the
// owner. Everyone else gets a fuzzed area coordinate (publicCoord), so the
// public map can show the neighbourhood without exposing the building.

import { describe, expect, it } from "vitest";
import { toDTO } from "@/lib/listing-utils";
import { publicCoord } from "@/lib/city-coords";

const EXACT = { lat: 41.0123, lng: 28.9456 };

function makeListing(over: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    userId: "owner-1",
    title: "Flat",
    description: "d",
    propertyType: "APARTMENT",
    city: "Istanbul",
    neighbourhood: "Ayvansaray",
    country: "Türkiye",
    sizeSqm: 70,
    sleeps: 4,
    availableFrom: new Date("2026-08-01"),
    availableTo: new Date("2026-09-30"),
    minStayDays: 3,
    maxStayDays: 30,
    lat: EXACT.lat,
    lng: EXACT.lng,
    ...over,
  } as unknown as Parameters<typeof toDTO>[0];
}

describe("listing coordinate privacy", () => {
  it("returns the exact coordinate to the owner", () => {
    const dto = toDTO(makeListing(), { includeExactCoords: true });
    expect(dto.lat).toBe(EXACT.lat);
    expect(dto.lng).toBe(EXACT.lng);
  });

  it("fuzzes the coordinate by default (non-owner / public)", () => {
    const dto = toDTO(makeListing());
    expect(dto.lat).not.toBe(EXACT.lat);
    expect(dto.lng).not.toBe(EXACT.lng);
    // Still in the same area — within a couple of km of the real point.
    expect(Math.abs((dto.lat as number) - EXACT.lat)).toBeLessThan(0.03);
    expect(Math.abs((dto.lng as number) - EXACT.lng)).toBeLessThan(0.03);
  });

  it("fuzz is deterministic so the public pin is stable", () => {
    const a = toDTO(makeListing());
    const b = toDTO(makeListing());
    expect(a.lat).toBe(b.lat);
    expect(a.lng).toBe(b.lng);
  });

  it("leaves null coordinates untouched", () => {
    const dto = toDTO(makeListing({ lat: null, lng: null }));
    expect(dto.lat).toBeNull();
    expect(dto.lng).toBeNull();
  });

  it("publicCoord keys off the id so different listings don't stack", () => {
    const one = publicCoord(EXACT.lat, EXACT.lng, "listing-1");
    const two = publicCoord(EXACT.lat, EXACT.lng, "listing-2");
    expect(one).not.toEqual(two);
  });
});
