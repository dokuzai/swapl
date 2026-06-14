// GET /api/cron/trip-nudges — T-7d home-guide reminders (only to a party whose
// own guide is incomplete) and the day-of check-in nudge (only if nobody has
// checked in). Both stamp a once-flag so reruns are no-ops. Prisma + notifiers
// mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => {}),
  sendPush: vi.fn(async () => {}),
  guideReminderEmail: vi.fn((to: string, city: string) => ({ to, subject: "Complete your home guide", text: city })),
  guideReminderPush: vi.fn((proposalId: string, city: string) => ({ title: "Complete your home guide", body: city, data: { kind: "homeGuideReminder", proposalId, deepLink: "" } })),
  checkInNudgeEmail: vi.fn((to: string, city: string) => ({ to, subject: `Arrived in ${city}?`, text: "" })),
  checkInNudgePush: vi.fn((proposalId: string, city: string) => ({ title: `Arrived in ${city}?`, body: "", data: { kind: "checkInNudge", proposalId, deepLink: "" } })),
  guideFindMany: vi.fn(),
  nudgeFindMany: vi.fn(),
  update: vi.fn(async () => ({})),
  isAuthorizedCron: vi.fn(() => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { homeGuideReminder: mocks.guideReminderEmail, checkInNudge: mocks.checkInNudgeEmail },
}));
vi.mock("@/lib/push", () => ({
  sendPush: mocks.sendPush,
  pushTemplates: { homeGuideReminder: mocks.guideReminderPush, checkInNudge: mocks.checkInNudgePush },
}));
vi.mock("@/lib/auth/cron", () => ({ isAuthorizedCron: mocks.isAuthorizedCron }));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: {
      findMany: vi
        .fn()
        .mockImplementation((args: { where: Record<string, unknown> }) =>
          "guideReminderSentAt" in args.where ? mocks.guideFindMany(args) : mocks.nudgeFindMany(args),
        ),
      update: mocks.update,
    },
  },
}));

import { GET } from "@/app/api/cron/trip-nudges/route";

const NOW = new Date("2026-06-14T12:00:00Z");
const fullGuide = { accessInstructions: "a", keyPickup: "b", wifiName: "c", wifiPassword: "d", heatingCooling: "e", kitchen: "f", bins: "g", petsPlants: "h" };

const req = () => new Request("https://swapl.test/api/cron/trip-nudges");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.isAuthorizedCron.mockReturnValue(true);
  mocks.guideFindMany.mockResolvedValue([]);
  mocks.nudgeFindMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("auth", () => {
  it("403 when the cron caller is not authorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    expect((await GET(req())).status).toBe(403);
  });
});

describe("home-guide reminders", () => {
  it("reminds only the party whose own guide is incomplete, then stamps", async () => {
    mocks.guideFindMany.mockResolvedValue([
      {
        id: "agr-1", proposalId: "prop-1",
        listing1: { city: "Lisbon", homeGuide: null, user: { id: "u1", email: "u1@swapl.test" } },
        listing2: { city: "Berlin", homeGuide: fullGuide, user: { id: "u2", email: "u2@swapl.test" } },
      },
    ]);
    const body = await (await GET(req())).json();
    expect(body.guideReminders).toBe(1);
    // Only u1 (incomplete) is reminded, with their own city.
    expect(mocks.guideReminderEmail).toHaveBeenCalledWith("u1@swapl.test", "Lisbon");
    expect(mocks.guideReminderEmail).not.toHaveBeenCalledWith("u2@swapl.test", "Berlin");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "agr-1" }, data: { guideReminderSentAt: expect.any(Date) } }));
  });
});

describe("day-of check-in nudge", () => {
  it("nudges both parties (to their destination city) when nobody has checked in", async () => {
    mocks.nudgeFindMany.mockResolvedValue([
      {
        id: "agr-2", proposalId: "prop-2",
        listing1: { city: "Lisbon", user: { id: "u1", email: "u1@swapl.test" } },
        listing2: { city: "Berlin", user: { id: "u2", email: "u2@swapl.test" } },
        checkEvents: [],
      },
    ]);
    const body = await (await GET(req())).json();
    expect(body.checkInNudges).toBe(2);
    // Each travels to the OTHER city.
    expect(mocks.checkInNudgeEmail).toHaveBeenCalledWith("u1@swapl.test", "Berlin");
    expect(mocks.checkInNudgeEmail).toHaveBeenCalledWith("u2@swapl.test", "Lisbon");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { checkInNudgeSentAt: expect.any(Date) } }));
  });

  it("skips the nudge (but still stamps) when a check-in already exists", async () => {
    mocks.nudgeFindMany.mockResolvedValue([
      {
        id: "agr-3", proposalId: "prop-3",
        listing1: { city: "Lisbon", user: { id: "u1", email: "u1@swapl.test" } },
        listing2: { city: "Berlin", user: { id: "u2", email: "u2@swapl.test" } },
        checkEvents: [{ id: "e1" }],
      },
    ]);
    const body = await (await GET(req())).json();
    expect(body.checkInNudges).toBe(0);
    expect(mocks.checkInNudgeEmail).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "agr-3" }, data: { checkInNudgeSentAt: expect.any(Date) } }));
  });
});
