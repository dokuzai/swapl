// GET /api/cron/agreements-complete — ACTIVE agreements whose dateTo has
// passed flip to COMPLETED; rerunning is a no-op (idempotent). Prisma is
// replaced with an in-memory table so updateMany semantics can be asserted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Agreement = { id: string; status: string; dateTo: Date };

const store = vi.hoisted(() => ({ agreements: [] as Agreement[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    swapAgreement: {
      // Honors exactly the filter shape the route uses.
      updateMany: vi.fn(async ({ where, data }: {
        where: { status: string; dateTo: { lt: Date } };
        data: { status: string };
      }) => {
        const hits = store.agreements.filter(
          (a) => a.status === where.status && a.dateTo < where.dateTo.lt
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.agreements = [
    { id: "past-active", status: "ACTIVE", dateTo: day("2026-06-01") },
    { id: "past-interrupted", status: "INTERRUPTED", dateTo: day("2026-06-01") },
    { id: "future-active", status: "ACTIVE", dateTo: day("2026-07-01") },
    { id: "already-completed", status: "COMPLETED", dateTo: day("2026-05-01") },
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

  it("is idempotent — a second sweep completes nothing", async () => {
    await GET(req());
    const second = await GET(req());
    expect(await second.json()).toEqual({ ok: true, completed: 0 });
  });
});
