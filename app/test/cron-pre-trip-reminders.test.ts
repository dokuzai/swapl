// GET /api/cron/pre-trip-reminders — selection window (ACTIVE, starting in
// the next 48h, not yet reminded), per-party destination cities, and the
// preTripReminderSentAt stamp that keeps the sweep idempotent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Agreement = {
  id: string;
  proposalId: string;
  status: string;
  dateFrom: Date;
  preTripReminderSentAt: Date | null;
  listing1: { city: string; userId: string; user: { email: string } };
  listing2: { city: string; userId: string; user: { email: string } };
};

const store = vi.hoisted(() => ({ agreements: [] as Agreement[] }));
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  preTripReminderEmail: vi.fn((to: string, city: string, dateFrom: Date) => ({
    to,
    subject: `48 hours to ${city}`,
    text: `starts ${dateFrom.toISOString()}`,
  })),
  preTripReminderPush: vi.fn((proposalId: string, city: string) => ({
    title: `48 hours to ${city}`,
    body: "Key codes are in your swap thread.",
    data: { kind: "preTripReminder", proposalId, deepLink: `swapl://swaps/${proposalId}` },
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { preTripReminder: mocks.preTripReminderEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { preTripReminder: mocks.preTripReminderPush },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: {
      // Applies the exact where shape the route builds.
      findMany: vi.fn(async ({ where }: {
        where: {
          status: string;
          preTripReminderSentAt: null;
          dateFrom: { gte: Date; lte: Date };
        };
      }) =>
        store.agreements.filter(
          (a) =>
            a.status === where.status &&
            a.preTripReminderSentAt === where.preTripReminderSentAt &&
            a.dateFrom >= where.dateFrom.gte &&
            a.dateFrom <= where.dateFrom.lte
        )
      ),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { preTripReminderSentAt: Date };
      }) => {
        const a = store.agreements.find((x) => x.id === where.id)!;
        a.preTripReminderSentAt = data.preTripReminderSentAt;
        return a;
      }),
    },
  },
}));

import { GET } from "@/app/api/cron/pre-trip-reminders/route";

const NOW = new Date("2026-06-10T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);

function agreement(id: string, overrides: Partial<Agreement> = {}): Agreement {
  return {
    id,
    proposalId: `prop-${id}`,
    status: "ACTIVE",
    dateFrom: hours(24),
    preTripReminderSentAt: null,
    listing1: { city: "Lisbon", userId: "u1", user: { email: "ana@swapl.test" } },
    listing2: { city: "Berlin", userId: "u2", user: { email: "ben@swapl.test" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.agreements = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const req = () => new Request("https://swapl.test/api/cron/pre-trip-reminders");

describe("GET /api/cron/pre-trip-reminders", () => {
  it("rejects unauthorized callers when CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(403);
  });

  it("selects only ACTIVE, un-reminded agreements starting within 48h", async () => {
    store.agreements = [
      agreement("in-window"),
      agreement("too-far", { dateFrom: hours(72) }),
      agreement("already-started", { dateFrom: hours(-2) }),
      agreement("already-reminded", { preTripReminderSentAt: hours(-12) }),
      agreement("completed", { status: "COMPLETED" }),
    ];
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, due: 1, sent: 1 });
    // Two parties × (1 email + 1 push) for the single in-window agreement.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
  });

  it("sends each party the OTHER home's city", async () => {
    store.agreements = [agreement("a1")];
    await GET(req());
    // Owner of listing1 (Lisbon) travels to Berlin, and vice versa.
    expect(mocks.preTripReminderEmail).toHaveBeenCalledWith("ana@swapl.test", "Berlin", hours(24));
    expect(mocks.preTripReminderEmail).toHaveBeenCalledWith("ben@swapl.test", "Lisbon", hours(24));
    expect(mocks.preTripReminderPush).toHaveBeenCalledWith("prop-a1", "Berlin");
    expect(mocks.preTripReminderPush).toHaveBeenCalledWith("prop-a1", "Lisbon");
  });

  it("stamps preTripReminderSentAt so a rerun sends nothing", async () => {
    store.agreements = [agreement("a1")];
    await GET(req());
    expect(store.agreements[0].preTripReminderSentAt).not.toBeNull();

    mocks.sendEmail.mockClear();
    const second = await GET(req());
    expect(await second.json()).toEqual({ ok: true, due: 0, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
