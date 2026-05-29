import { describe, expect, it } from "vitest";
import { parseJSON, stringifyJSON } from "@/lib/db";

describe("parseJSON", () => {
  it("parses valid JSON", () => {
    expect(parseJSON('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("returns the fallback for null, undefined or empty input", () => {
    expect(parseJSON(null, "fallback")).toBe("fallback");
    expect(parseJSON(undefined, 42)).toBe(42);
    expect(parseJSON("", [])).toEqual([]);
  });

  it("returns the fallback for malformed JSON instead of throwing", () => {
    expect(parseJSON("{not valid", { ok: false })).toEqual({ ok: false });
  });
});

describe("stringifyJSON", () => {
  it("round-trips through parseJSON", () => {
    const value = { tags: ["wfh", "pets"], sleeps: 3 };
    expect(parseJSON(stringifyJSON(value), null)).toEqual(value);
  });
});
