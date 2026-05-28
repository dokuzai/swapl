import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashToken, normaliseEmail } from "@/lib/auth/tokens";

describe("hashToken", () => {
  it("is a deterministic sha256 hex digest", () => {
    const out = hashToken("a-raw-token");
    expect(out).toBe(createHash("sha256").update("a-raw-token").digest("hex"));
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps different inputs to different digests", () => {
    expect(hashToken("alpha")).not.toBe(hashToken("beta"));
  });
});

describe("normaliseEmail", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normaliseEmail("  Foo.Bar@Example.COM  ")).toBe("foo.bar@example.com");
  });

  it("leaves an already-normalised address unchanged", () => {
    expect(normaliseEmail("user@swapl.test")).toBe("user@swapl.test");
  });
});
