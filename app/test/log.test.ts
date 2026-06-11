// lib/log — structured logger emits one parseable JSON line per event on the
// right console channel, serializes Error objects, and forwards errors to the
// (no-op without SENTRY_DSN) Sentry wrapper without ever throwing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ calls: [] as Array<{ error: unknown; extra?: Record<string, unknown> }> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log/sentry", () => ({
  captureError: vi.fn((error: unknown, extra?: Record<string, unknown>) => {
    captured.calls.push({ error, extra });
  }),
}));

import { createLogger } from "@/lib/log";

const lastLine = (spy: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(spy.mock.calls.at(-1)![0] as string);

beforeEach(() => {
  captured.calls = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("createLogger", () => {
  it("emits info as a JSON line with ts/level/scope/message and extra fields", () => {
    const spy = vi.spyOn(console, "log");
    createLogger("cron:daily").info("job completed", { job: "featured-expire", durationMs: 12 });
    const line = lastLine(spy);
    expect(line).toMatchObject({
      level: "info",
      scope: "cron:daily",
      message: "job completed",
      job: "featured-expire",
      durationMs: 12,
    });
    expect(new Date(line.ts).getTime()).not.toBeNaN();
  });

  it("routes warn to console.warn", () => {
    const spy = vi.spyOn(console, "warn");
    createLogger("test").warn("heads up");
    expect(lastLine(spy)).toMatchObject({ level: "warn", message: "heads up" });
  });

  it("serializes Error objects and forwards them to captureError", () => {
    const spy = vi.spyOn(console, "error");
    const boom = new Error("boom");
    createLogger("cron:daily").error("job threw", boom, { job: "saved-searches" });
    const line = lastLine(spy);
    expect(line.error).toMatchObject({ name: "Error", message: "boom" });
    expect(line.error.stack).toContain("boom");
    expect(captured.calls).toEqual([
      { error: boom, extra: { scope: "cron:daily", message: "job threw", job: "saved-searches" } },
    ]);
  });

  it("logs error without an error object and skips capture", () => {
    const spy = vi.spyOn(console, "error");
    createLogger("test").error("failed", undefined, { status: 500 });
    expect(lastLine(spy)).toMatchObject({ level: "error", message: "failed", status: 500 });
    expect(captured.calls).toHaveLength(0);
  });
});
