// POST /api/agreements/{id}/check-in and /check-out — party gating, event
// creation, idempotency per (type, user), other-party notification, and the
// derived IN_PROGRESS phase after a check-in. Prisma + session + notifiers
// mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  agreementFindUnique: vi.fn(),
  checkEventFindFirst: vi.fn(),
  checkEventCreate: vi.fn(),
  sendEmail: vi.fn(async (_msg: unknown) => {}),
  sendPush: vi.fn(async (_userId: string, _payload: unknown) => {}),
  checkedInEmail: vi.fn((to: string, name: string) => ({ to, subject: `${name} has checked in`, text: "" })),
  checkedOutEmail: vi.fn((to: string, name: string) => ({ to, subject: `${name} has checked out`, text: "" })),
  checkedInPush: vi.fn((proposalId: string, name: string) => ({ title: `${name} has checked in`, body: "", data: { kind: "checkedIn", proposalId, deepLink: "" } })),
  checkedOutPush: vi.fn((proposalId: string, name: string) => ({ title: `${name} has checked out`, body: "", data: { kind: "checkedOut", proposalId, deepLink: "" } })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { checkedIn: mocks.checkedInEmail, checkedOut: mocks.checkedOutEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { checkedIn: mocks.checkedInPush, checkedOut: mocks.checkedOutPush },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: { findUnique: mocks.agreementFindUnique },
    swapCheckEvent: { findFirst: mocks.checkEventFindFirst, create: mocks.checkEventCreate },
  },
}));

import { POST as checkIn } from "@/app/api/agreements/[id]/check-in/route";
import { POST as checkOut } from "@/app/api/agreements/[id]/check-out/route";
import { getTripPhase } from "@/lib/trip/phase";

const NOW = new Date("2026-06-14T12:00:00Z");

function agreement(over: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    proposalId: "prop-1",
    status: "ACTIVE",
    dateFrom: new Date("2026-06-14T08:00:00Z"), // already started
    dateTo: new Date("2026-06-20T08:00:00Z"),
    listing1: { userId: "u1", user: { id: "u1", name: "Ana", email: "ana@swapl.test" } },
    listing2: { userId: "u2", user: { id: "u2", name: "Ben", email: "ben@swapl.test" } },
    ...over,
  };
}

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

function createdData(): Record<string, string> {
  const calls = mocks.checkEventCreate.mock.calls as unknown as Array<[{ data: Record<string, string> }]>;
  return calls[0][0].data;
}

function call(fn: Handler, body: unknown = {}, id = "agr-1") {
  return fn(
    new Request(`https://swapl.test/api/agreements/${id}/check-in`, {
      method: "POST",
      headers: { "x-forwarded-for": `ip-${Math.random()}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Unique user per test so the in-memory rate limiter never trips across tests.
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u1" });
  mocks.agreementFindUnique.mockResolvedValue(agreement());
  mocks.checkEventFindFirst.mockResolvedValue(null);
  mocks.checkEventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "evt-1",
    createdAt: NOW,
    ...data,
  }));
});

describe("check-in gating", () => {
  it("401 unauthenticated", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    expect((await call(checkIn)).status).toBe(401);
  });

  it("403 for a non-party", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "stranger" });
    expect((await call(checkIn)).status).toBe(403);
  });

  it("404 when the agreement is missing", async () => {
    mocks.agreementFindUnique.mockResolvedValue(null);
    expect((await call(checkIn)).status).toBe(404);
  });

  it("409 when the swap is interrupted", async () => {
    mocks.agreementFindUnique.mockResolvedValue(agreement({ status: "INTERRUPTED" }));
    expect((await call(checkIn)).status).toBe(409);
  });
});

describe("check-in creates event + notifies the other party", () => {
  it("creates a checkin event and notifies the OTHER party only", async () => {
    const res = await call(checkIn, { note: "Arrived!", photos: ["https://cdn.swapl.test/a.jpg"] });
    expect(res.status).toBe(200);
    const created = createdData();
    expect(created.type).toBe("checkin");
    expect(created.userId).toBe("u1");
    expect(JSON.parse(created.photos)).toEqual(["https://cdn.swapl.test/a.jpg"]);

    // Ana (u1) checked in -> Ben (u2) is notified.
    expect(mocks.checkedInEmail).toHaveBeenCalledWith("ben@swapl.test", "Ana");
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush.mock.calls[0][0]).toBe("u2");
  });

  it("a check-in makes the derived phase IN_PROGRESS", async () => {
    await call(checkIn);
    const created = createdData();
    const phase = getTripPhase(agreement(), [{ type: created.type, userId: created.userId }], NOW);
    expect(phase).toBe("IN_PROGRESS");
  });

  it("is idempotent per (type, user) — no duplicate event, no re-notify", async () => {
    mocks.checkEventFindFirst.mockResolvedValue({ id: "evt-existing", type: "checkin", note: null, photos: "[]", createdAt: NOW });
    const res = await call(checkIn);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(mocks.checkEventCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("rejects invalid photo URLs", async () => {
    expect((await call(checkIn, { photos: ["not-a-url"] })).status).toBe(400);
  });
});

describe("check-out", () => {
  it("creates a checkout event and notifies the other party", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u2" });
    const res = await call(checkOut, {}, "agr-1");
    expect(res.status).toBe(200);
    const created = createdData();
    expect(created.type).toBe("checkout");
    // Ben (u2) checked out -> Ana (u1) notified.
    expect(mocks.checkedOutEmail).toHaveBeenCalledWith("ana@swapl.test", "Ben");
  });
});
