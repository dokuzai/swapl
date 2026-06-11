// lib/api/errors — the shared helpers must emit the exact bodies/statuses the
// routes used to build by hand, since clients (web/iOS/Android) match on them.

import { describe, expect, it } from "vitest";
import {
  apiError,
  accountSuspended,
  forbidden,
  invalidInput,
  notFound,
  serverError,
  unauthenticated,
  unprocessable,
} from "@/lib/api/errors";

describe("lib/api/errors", () => {
  it("unauthenticated -> 401 UNAUTHENTICATED", async () => {
    const res = unauthenticated();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("forbidden -> 403 with default and custom messages", async () => {
    const def = forbidden();
    expect(def.status).toBe(403);
    expect(await def.json()).toEqual({ error: "Forbidden" });

    const custom = forbidden("Only proposer can withdraw.");
    expect(custom.status).toBe(403);
    expect(await custom.json()).toEqual({ error: "Only proposer can withdraw." });
  });

  it("accountSuspended -> 403 with the shared support copy", async () => {
    const res = accountSuspended();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "ACCOUNT_SUSPENDED",
      message: "This account has been suspended. Contact support@swapl.com.",
    });
  });

  it("notFound -> 404 with default and custom messages", async () => {
    const def = notFound();
    expect(def.status).toBe(404);
    expect(await def.json()).toEqual({ error: "Not found" });

    const custom = notFound("Target listing not found");
    expect(await custom.json()).toEqual({ error: "Target listing not found" });
  });

  it("invalidInput -> 400 and carries zod issues through extra", async () => {
    const issues = [{ path: ["email"], message: "Invalid email" }];
    const res = invalidInput("Invalid input", { issues });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input", issues });
  });

  it("unprocessable -> 422", async () => {
    const res = unprocessable("City not recognised");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "City not recognised" });
  });

  it("serverError -> 500 with a generic message", async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("apiError is a generic escape hatch for other statuses", async () => {
    const res = apiError(429, "Too many login attempts. Try again in a few minutes.");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Too many login attempts. Try again in a few minutes.",
    });
  });
});
