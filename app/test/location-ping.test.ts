// /api/location/ping — records a device (gps) fix when sent, else falls back to
// the request's geo-IP headers (ip), else no-ops. Prisma + session mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  locationDayFindUnique: vi.fn(),
  locationDayUpsert: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock("@/lib/db", () => ({
  prisma: {
    userLocationDay: { findUnique: mocks.locationDayFindUnique, upsert: mocks.locationDayUpsert },
    user: { update: mocks.userUpdate, findUnique: mocks.userFindUnique },
  },
}));

import { POST as ping } from "@/app/api/location/ping/route";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://swapl.test/api/location/ping", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionFromRequest.mockResolvedValue(session);
  mocks.locationDayFindUnique.mockResolvedValue(null);
  mocks.locationDayUpsert.mockResolvedValue({});
  mocks.userUpdate.mockResolvedValue({});
  // Opted in by default for most tests.
  mocks.userFindUnique.mockResolvedValue({ settings: JSON.stringify({ countDaysAbroad: true }) });
});

describe("POST /api/location/ping", () => {
  it("401s without a session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);
    const res = await ping(req({}));
    expect(res.status).toBe(401);
  });

  it("records a device (gps) fix when the body carries a country", async () => {
    const res = await ping(req({ countryCode: "pt", region: "13", city: "Lisbon" }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: "gps" });
    expect(mocks.locationDayUpsert).toHaveBeenCalledOnce();
    const arg = mocks.locationDayUpsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ countryCode: "PT", source: "gps", city: "Lisbon" });
  });

  it("falls back to geo-IP headers when no device fix is sent", async () => {
    const res = await ping(req({}, { "x-vercel-ip-country": "IT", "x-vercel-ip-city": "Milan%20Centro" }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: "ip" });
    const arg = mocks.locationDayUpsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ countryCode: "IT", source: "ip", city: "Milan Centro" });
  });

  it("stores nothing when the user hasn't opted in (default off)", async () => {
    mocks.userFindUnique.mockResolvedValue({ settings: JSON.stringify({ countDaysAbroad: false }) });
    const res = await ping(req({ countryCode: "PT" }));
    expect((await res.json()).ok).toBe(true);
    expect(mocks.locationDayUpsert).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("stores nothing for a user with default settings (null column)", async () => {
    mocks.userFindUnique.mockResolvedValue({ settings: null });
    await ping(req({ countryCode: "PT" }));
    expect(mocks.locationDayUpsert).not.toHaveBeenCalled();
  });

  it("no-ops gracefully when there's no signal at all", async () => {
    const res = await ping(req({}));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: "none" });
    expect(mocks.locationDayUpsert).not.toHaveBeenCalled();
  });
});
