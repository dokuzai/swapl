// JRN-HPre-01 helpers: parse a UploadThing file key from a ufsUrl, and a
// best-effort delete that no-ops when the token is unset. UTApi is mocked so
// no network call happens.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteFiles = vi.hoisted(() => vi.fn(async () => ({ success: true, deletedCount: 1 })));
vi.mock("uploadthing/server", () => ({
  // Regular function so `new UTApi()` works (arrow fns aren't constructors).
  UTApi: vi.fn(function () {
    return { deleteFiles };
  }),
}));

import { fileKeyFromUploadThingUrl, deleteUploadThingUrls } from "@/lib/uploadthing-server";

describe("fileKeyFromUploadThingUrl", () => {
  it("returns the last path segment for ufs.sh and utfs.io hosts", () => {
    expect(fileKeyFromUploadThingUrl("https://appid.ufs.sh/f/abc123_deed.jpg")).toBe("abc123_deed.jpg");
    expect(fileKeyFromUploadThingUrl("https://utfs.io/f/xyz789")).toBe("xyz789");
    expect(fileKeyFromUploadThingUrl("https://sub.utfs.io/f/key-2")).toBe("key-2");
  });

  it("URL-decodes the key", () => {
    expect(fileKeyFromUploadThingUrl("https://utfs.io/f/a%20b.png")).toBe("a b.png");
  });

  it("returns null for non-UploadThing hosts and malformed input", () => {
    expect(fileKeyFromUploadThingUrl("https://evil.example.com/f/x")).toBeNull();
    expect(fileKeyFromUploadThingUrl("not a url")).toBeNull();
    expect(fileKeyFromUploadThingUrl("https://utfs.io/")).toBeNull();
  });
});

describe("deleteUploadThingUrls", () => {
  beforeEach(() => {
    deleteFiles.mockClear();
    vi.stubEnv("UPLOADTHING_TOKEN", "test-token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deletes the parsed keys for valid UploadThing urls", async () => {
    await deleteUploadThingUrls(["https://utfs.io/f/k1", "https://appid.ufs.sh/f/k2"]);
    expect(deleteFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("skips non-UploadThing urls (only deletes resolvable keys)", async () => {
    await deleteUploadThingUrls(["https://evil.example.com/f/x", "https://utfs.io/f/k1"]);
    expect(deleteFiles).toHaveBeenCalledWith(["k1"]);
  });

  it("no-ops when nothing resolves to a key", async () => {
    await deleteUploadThingUrls(["https://evil.example.com/x"]);
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it("no-ops (no throw) when UPLOADTHING_TOKEN is unset", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");
    await expect(deleteUploadThingUrls(["https://utfs.io/f/k1"])).resolves.toBeUndefined();
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it("is non-fatal when the delete API throws", async () => {
    deleteFiles.mockRejectedValueOnce(new Error("api down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deleteUploadThingUrls(["https://utfs.io/f/k1"])).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
