// GET /api/cron/keys-stays-complete — confirmed Keys stays whose dateTo has
// passed flip to "completed" via select-then-update (so the route knows exactly
// which ids transitioned), the host gets a completion push, and rerunning is a
// no-op (idempotent). Prisma is replaced with an in-memory table so the
// findMany/updateMany semantics can be asserted. No ledger writes happen on
// completion (Keys already moved at confirm).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Stay = { id: string; hostId: string; status: string; dateTo: Date };

const store = vi.hoisted(() => ({ stays: [] as Stay[] }));
const mocks = vi.hoisted(() => ({
  sendPush: vi.fn(async (_userId: string, _payload: unknown) => {}),
  keysStayCompletedPush: vi.fn((stayId: string) => ({
    title: "Your Keys stay is complete 🔑",
    body: "Your guest has checked out — see it in your hosting history.",
    data: { kind: "keysStayCompleted", stayId, deepLink: `swapl://keys/stays/${stayId}` },
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { keysStayCompleted: mocks.keysStayCompletedPush },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    keysStay: {
      findMany: vi.fn(async ({ where }: { where: { status: string; dateTo: { lt: Date } } }) =>
        store.stays
          .filter((s) => s.status === where.status && s.dateTo < where.dateTo.lt)
          .map((s) => ({ id: s.id, hostId: s.hostId }))
      ),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string | { in: string[] }; status: string };
        data: { status: string };
      }) => {
        const matchId = (id: string) =>
          typeof where.id === "string" ? where.id === id : where.id.in.includes(id);
        const hits = store.stays.filter((s) => matchId(s.id) && s.status === where.status);
        hits.forEach((s) => (s.status = data.status));
        return { count: hits.length };
      }),
    },
  },
}));

import { GET } from "@/app/api/cron/keys-stays-complete/route";

const NOW = new Date("2026-06-10T12:00:00Z");
const day = (iso: string) => new Date(iso);

function stay(id: string, overrides: Partial<Stay> = {}): Stay {
  return { id, hostId: `host-${id}`, status: "confirmed", dateTo: day("2026-06-01"), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.stays = [
    stay("past-confirmed"),
    stay("past-pending", { status: "pending" }),
    stay("past-declined", { status: "declined" }),
    stay("future-confirmed", { dateTo: day("2026-07-01") }),
    stay("already-completed", { status: "completed", dateTo: day("2026-05-01") }),
  ];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const req = (headers?: Record<string, string>) =>
  new Request("https://swapl.test/api/cron/keys-stays-complete", { headers });

describe("GET /api/cron/keys-stays-complete", () => {
  it("rejects when CRON_SECRET is set and the bearer is missing or wrong", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(403);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(403);
  });

  it("accepts the configured bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req({ authorization: "Bearer s3cret" }))).status).toBe(200);
  });

  it("completes only confirmed stays whose dateTo has passed", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, completed: 1 });
    const byId = new Map(store.stays.map((s) => [s.id, s.status]));
    expect(byId.get("past-confirmed")).toBe("completed");
    expect(byId.get("past-pending")).toBe("pending"); // never accepted → untouched
    expect(byId.get("past-declined")).toBe("declined"); // untouched
    expect(byId.get("future-confirmed")).toBe("confirmed"); // still upcoming
  });

  it("notifies the host of each transitioned stay (push)", async () => {
    await GET(req());
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush).toHaveBeenCalledWith("host-past-confirmed", expect.any(Object));
    expect(mocks.keysStayCompletedPush).toHaveBeenCalledWith("past-confirmed");
  });

  it("iterates over multiple transitioned stays", async () => {
    store.stays = [stay("a"), stay("b"), stay("c", { dateTo: day("2026-07-01") })];
    expect(await (await GET(req())).json()).toEqual({ ok: true, completed: 2 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a second sweep completes and notifies nothing", async () => {
    await GET(req());
    vi.clearAllMocks();
    expect(await (await GET(req())).json()).toEqual({ ok: true, completed: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("a failed push never fails the sweep", async () => {
    mocks.sendPush.mockRejectedValue(new Error("fcm down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, completed: 1 });
    errSpy.mockRestore();
  });
});
