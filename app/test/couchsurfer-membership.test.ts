// isCouchsurferMember (DOK-219) — the gate for sending free couch requests.
// Active/trialing/past_due membership that hasn't lapsed → true; admins always
// true; missing/expired/canceled → false.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  membershipFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    couchsurferMembership: { findUnique: mocks.membershipFindUnique },
  },
}));

import { isCouchsurferMember } from "@/lib/billing/limits";

const future = new Date(Date.now() + 30 * 864e5);
const past = new Date(Date.now() - 864e5);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({ role: "member" });
});

describe("isCouchsurferMember", () => {
  it("true for an active membership in period", async () => {
    mocks.membershipFindUnique.mockResolvedValue({ status: "active", currentPeriodEnd: future });
    expect(await isCouchsurferMember("u1")).toBe(true);
  });

  it("true for trialing, false for canceled", async () => {
    mocks.membershipFindUnique.mockResolvedValue({ status: "trialing", currentPeriodEnd: future });
    expect(await isCouchsurferMember("u1")).toBe(true);
    mocks.membershipFindUnique.mockResolvedValue({ status: "canceled", currentPeriodEnd: future });
    expect(await isCouchsurferMember("u1")).toBe(false);
  });

  it("false when the period has lapsed even if status is active", async () => {
    mocks.membershipFindUnique.mockResolvedValue({ status: "active", currentPeriodEnd: past });
    expect(await isCouchsurferMember("u1")).toBe(false);
  });

  it("false when there is no membership", async () => {
    mocks.membershipFindUnique.mockResolvedValue(null);
    expect(await isCouchsurferMember("u1")).toBe(false);
  });

  it("true for an admin regardless of membership", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "swapl_admin" });
    mocks.membershipFindUnique.mockResolvedValue(null);
    expect(await isCouchsurferMember("admin")).toBe(true);
  });
});
