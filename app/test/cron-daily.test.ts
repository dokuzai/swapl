// GET /api/cron/daily — umbrella dispatcher runs every job even when one
// throws or fails: the error is recorded per-job (structured log + capture)
// and the remaining jobs still execute. Sub-routes are mocked so no Prisma,
// email, or push wiring is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ errors: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log/sentry", () => ({
  captureError: vi.fn((error: unknown) => captured.errors.push(error)),
}));
vi.mock("@/app/api/cron/featured-expire/route", () => ({
  GET: vi.fn(async () => Response.json({ ok: true, expired: 2 })),
}));
vi.mock("@/app/api/cron/saved-searches/route", () => ({
  GET: vi.fn(async () => {
    throw new Error("db unreachable");
  }),
}));
vi.mock("@/app/api/cron/agreements-complete/route", () => ({
  GET: vi.fn(async () => Response.json({ error: "INTERNAL" }, { status: 500 })),
}));
vi.mock("@/app/api/cron/pre-trip-reminders/route", () => ({
  GET: vi.fn(async () => Response.json({ ok: true, due: 0, sent: 0 })),
}));
vi.mock("@/app/api/cron/review-reminders/route", () => ({
  GET: vi.fn(async () => Response.json({ ok: true, due: 0, reminded: 0 })),
}));
vi.mock("@/app/api/cron/location-sweep/route", () => ({
  GET: vi.fn(async () => Response.json({ ok: true, carried: 0 })),
}));

import { GET } from "@/app/api/cron/daily/route";
import { GET as preTripReminders } from "@/app/api/cron/pre-trip-reminders/route";

beforeEach(() => {
  captured.errors = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const req = (headers?: Record<string, string>) =>
  new Request("https://swapl.test/api/cron/daily", { headers });

describe("GET /api/cron/daily", () => {
  it("rejects when CRON_SECRET is set and the bearer is missing", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(403);
  });

  it("a throwing job does not block the jobs after it", async () => {
    const res = await GET(req());
    expect(res.status).toBe(500); // at least one job failed
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.results["featured-expire"]).toEqual({ ok: true, expired: 2 });
    expect(body.results["saved-searches"]).toEqual({ error: "db unreachable" });
    expect(body.results["agreements-complete"]).toEqual({ error: "INTERNAL" });
    // The job after the throwing one still ran and reported its outcome.
    expect(vi.mocked(preTripReminders)).toHaveBeenCalledOnce();
    expect(body.results["pre-trip-reminders"]).toEqual({ ok: true, due: 0, sent: 0 });
    expect(body.results["review-reminders"]).toEqual({ ok: true, due: 0, reminded: 0 });
  });

  it("captures the thrown error for error tracking", async () => {
    await GET(req());
    expect(captured.errors).toHaveLength(1);
    expect((captured.errors[0] as Error).message).toBe("db unreachable");
  });

  it("logs a per-job outcome line for every job", async () => {
    const logSpy = vi.spyOn(console, "log");
    const errSpy = vi.spyOn(console, "error");
    await GET(req());
    const lines = [...logSpy.mock.calls, ...errSpy.mock.calls].map((c) => JSON.parse(c[0] as string));
    const byJob = new Map(lines.map((l) => [l.job, l]));
    expect(byJob.get("featured-expire")).toMatchObject({ level: "info", scope: "cron:daily" });
    expect(byJob.get("saved-searches")).toMatchObject({ level: "error" });
    expect(byJob.get("agreements-complete")).toMatchObject({ level: "error", status: 500 });
    expect(byJob.get("pre-trip-reminders")).toMatchObject({ level: "info" });
    expect(byJob.get("review-reminders")).toMatchObject({ level: "info" });
    for (const l of lines) expect(typeof l.durationMs).toBe("number");
  });
});
