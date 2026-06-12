// GET /api/cron/review-reminders — agreements COMPLETED >= 7 days ago (by
// dateTo) where a party hasn't reviewed yet get a one-time email + push
// nudge; reviewReminderSentAt keeps the sweep idempotent, and parties who
// already reviewed are skipped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Agreement = {
  id: string;
  proposalId: string;
  status: string;
  dateTo: Date;
  reviewReminderSentAt: Date | null;
  listing1: { city: string; userId: string; user: { email: string } };
  listing2: { city: string; userId: string; user: { email: string } };
  reviews: { authorId: string }[];
};

const store = vi.hoisted(() => ({ agreements: [] as Agreement[] }));
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_msg: unknown) => {}),
  sendPush: vi.fn(async (_userId: string, _payload: unknown) => {}),
  reviewReminderEmail: vi.fn((to: string, otherCity: string) => ({
    to,
    subject: "Don't forget to review your swap",
    text: `swap with ${otherCity}`,
  })),
  reviewReminderPush: vi.fn((proposalId: string) => ({
    title: "Don't forget to review your swap",
    body: "Your review is still open — it takes two minutes.",
    data: { kind: "reviewReminder", proposalId, deepLink: `swapl://swaps/${proposalId}` },
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { reviewReminder: mocks.reviewReminderEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { reviewReminder: mocks.reviewReminderPush },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: {
      // Applies the exact where shape the route builds.
      findMany: vi.fn(async ({ where }: {
        where: { status: string; reviewReminderSentAt: null; dateTo: { lt: Date } };
      }) =>
        store.agreements.filter(
          (a) =>
            a.status === where.status &&
            a.reviewReminderSentAt === where.reviewReminderSentAt &&
            a.dateTo < where.dateTo.lt
        )
      ),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { reviewReminderSentAt: Date };
      }) => {
        const a = store.agreements.find((x) => x.id === where.id)!;
        a.reviewReminderSentAt = data.reviewReminderSentAt;
        return a;
      }),
    },
  },
}));

import { GET } from "@/app/api/cron/review-reminders/route";

const NOW = new Date("2026-06-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function agreement(id: string, overrides: Partial<Agreement> = {}): Agreement {
  return {
    id,
    proposalId: `prop-${id}`,
    status: "COMPLETED",
    dateTo: daysAgo(10),
    reviewReminderSentAt: null,
    listing1: { city: "Lisbon", userId: `u1-${id}`, user: { email: `u1-${id}@swapl.test` } },
    listing2: { city: "Berlin", userId: `u2-${id}`, user: { email: `u2-${id}@swapl.test` } },
    reviews: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.agreements = [agreement("a")];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const req = (headers?: Record<string, string>) =>
  new Request("https://swapl.test/api/cron/review-reminders", { headers });

describe("GET /api/cron/review-reminders", () => {
  it("rejects when CRON_SECRET is set and the bearer is missing or wrong", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(403);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(403);
  });

  it("reminds both parties when neither has reviewed, and stamps the agreement", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, due: 1, reminded: 2 });

    expect(mocks.reviewReminderEmail).toHaveBeenCalledWith("u1-a@swapl.test", "Berlin");
    expect(mocks.reviewReminderEmail).toHaveBeenCalledWith("u2-a@swapl.test", "Lisbon");
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
    expect(mocks.reviewReminderPush).toHaveBeenCalledWith("prop-a");
    expect(store.agreements[0].reviewReminderSentAt).toBeInstanceOf(Date);
  });

  it("skips parties who already reviewed", async () => {
    store.agreements = [agreement("a", { reviews: [{ authorId: "u1-a" }] })];
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, due: 1, reminded: 1 });
    expect(mocks.reviewReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.reviewReminderEmail).toHaveBeenCalledWith("u2-a@swapl.test", "Lisbon");
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush.mock.calls[0][0]).toBe("u2-a");
  });

  it("stamps (but sends nothing) when both parties already reviewed", async () => {
    store.agreements = [
      agreement("a", { reviews: [{ authorId: "u1-a" }, { authorId: "u2-a" }] }),
    ];
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, due: 1, reminded: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(store.agreements[0].reviewReminderSentAt).toBeInstanceOf(Date);
  });

  it("ignores agreements completed less than 7 days ago, non-COMPLETED, or already reminded", async () => {
    store.agreements = [
      agreement("fresh", { dateTo: daysAgo(3) }),
      agreement("active", { status: "ACTIVE" }),
      agreement("reminded", { reviewReminderSentAt: daysAgo(1) }),
    ];
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, due: 0, reminded: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("is idempotent — a second sweep sends nothing", async () => {
    await GET(req());
    vi.clearAllMocks();
    const second = await GET(req());
    expect(await second.json()).toEqual({ ok: true, due: 0, reminded: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});
