// GET /api/cron/agreements-complete — ACTIVE agreements whose dateTo has
// passed flip to COMPLETED via select-then-update (so the route knows exactly
// which ids transitioned), both parties get a "leave a review" email + push,
// and rerunning is a no-op (idempotent). Prisma is replaced with an in-memory
// table so the findMany/updateMany semantics can be asserted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Agreement = {
  id: string;
  proposalId: string;
  status: string;
  dateTo: Date;
  listing1: { city: string; userId: string; user: { email: string } };
  listing2: { city: string; userId: string; user: { email: string } };
};

const store = vi.hoisted(() => ({ agreements: [] as Agreement[] }));
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_msg: unknown) => {}),
  sendPush: vi.fn(async (_userId: string, _payload: unknown) => {}),
  swapCompletedEmail: vi.fn((to: string, otherCity: string) => ({
    to,
    subject: "Your swap is complete — how was your stay?",
    text: `swap with ${otherCity}`,
  })),
  swapCompletedPush: vi.fn((proposalId: string) => ({
    title: "Your swap is complete — how was your stay?",
    body: "Leave a review for your swap partner.",
    data: { kind: "swapCompleted", proposalId, deepLink: `swapl://swaps/${proposalId}` },
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { swapCompleted: mocks.swapCompletedEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { swapCompleted: mocks.swapCompletedPush },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: {
      // Honors exactly the filter shape the route uses.
      findMany: vi.fn(async ({ where }: {
        where: { status: string; dateTo: { lt: Date } };
      }) =>
        store.agreements.filter(
          (a) => a.status === where.status && a.dateTo < where.dateTo.lt
        )
      ),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: { in: string[] }; status: string };
        data: { status: string };
      }) => {
        const hits = store.agreements.filter(
          (a) => where.id.in.includes(a.id) && a.status === where.status
        );
        hits.forEach((a) => (a.status = data.status));
        return { count: hits.length };
      }),
    },
  },
}));

import { GET } from "@/app/api/cron/agreements-complete/route";

const NOW = new Date("2026-06-10T12:00:00Z");
const day = (iso: string) => new Date(iso);

function agreement(id: string, overrides: Partial<Agreement> = {}): Agreement {
  return {
    id,
    proposalId: `prop-${id}`,
    status: "ACTIVE",
    dateTo: day("2026-06-01"),
    listing1: { city: "Lisbon", userId: `u1-${id}`, user: { email: `u1-${id}@swapl.test` } },
    listing2: { city: "Berlin", userId: `u2-${id}`, user: { email: `u2-${id}@swapl.test` } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.agreements = [
    agreement("past-active"),
    agreement("past-interrupted", { status: "INTERRUPTED" }),
    agreement("future-active", { dateTo: day("2026-07-01") }),
    agreement("already-completed", { status: "COMPLETED", dateTo: day("2026-05-01") }),
  ];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const req = (headers?: Record<string, string>) =>
  new Request("https://swapl.test/api/cron/agreements-complete", { headers });

describe("GET /api/cron/agreements-complete", () => {
  it("rejects when CRON_SECRET is set and the bearer is missing or wrong", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(403);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(403);
  });

  it("accepts the configured bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
  });

  it("completes only ACTIVE agreements whose dateTo has passed", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, completed: 1 });
    const byId = new Map(store.agreements.map((a) => [a.id, a.status]));
    expect(byId.get("past-active")).toBe("COMPLETED");
    expect(byId.get("past-interrupted")).toBe("INTERRUPTED"); // untouched
    expect(byId.get("future-active")).toBe("ACTIVE"); // still running
  });

  it("notifies BOTH parties of each transitioned agreement (email + push)", async () => {
    await GET(req());

    // Exactly one agreement transitioned → 2 emails + 2 pushes.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);

    // Party 1 stayed in listing2's city and vice versa.
    expect(mocks.swapCompletedEmail).toHaveBeenCalledWith("u1-past-active@swapl.test", "Berlin");
    expect(mocks.swapCompletedEmail).toHaveBeenCalledWith("u2-past-active@swapl.test", "Lisbon");
    const pushedUsers = mocks.sendPush.mock.calls.map((c) => c[0]);
    expect(pushedUsers).toEqual(
      expect.arrayContaining(["u1-past-active", "u2-past-active"])
    );
    expect(mocks.swapCompletedPush).toHaveBeenCalledWith("prop-past-active");
  });

  it("iterates over multiple transitioned agreements", async () => {
    store.agreements = [agreement("a"), agreement("b"), agreement("c", { dateTo: day("2026-07-01") })];
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, completed: 2 });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(4); // 2 agreements x 2 parties
    expect(mocks.sendPush).toHaveBeenCalledTimes(4);
  });

  it("is idempotent — a second sweep completes and notifies nothing", async () => {
    await GET(req());
    vi.clearAllMocks();
    const second = await GET(req());
    expect(await second.json()).toEqual({ ok: true, completed: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("a failed notification never fails the sweep", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("smtp down"));
    mocks.sendPush.mockRejectedValue(new Error("fcm down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, completed: 1 });
    errSpy.mockRestore();
  });
});
