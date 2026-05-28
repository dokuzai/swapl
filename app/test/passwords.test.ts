import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

describe("hashPassword / verifyPassword", () => {
  it("never stores the plaintext and verifies a correct password", async () => {
    const plain = "correct horse battery staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("the-right-one");
    expect(await verifyPassword("the-wrong-one", hash)).toBe(false);
  });

  it("returns false (without throwing) for a missing hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("produces a bcrypt hash at cost factor 10", async () => {
    expect(await hashPassword("abc")).toMatch(/^\$2[aby]\$10\$/);
  });

  it("salts each hash so identical passwords differ", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});
