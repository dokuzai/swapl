import { describe, expect, it } from "vitest";
import {
  anchorPolicy,
  canonicalJson,
  certificateHash,
  explorerUrl,
  isEnabled,
  readConfig,
  type AnchorablePolicy,
} from "@/lib/chain/ton";

const policy: AnchorablePolicy = {
  policyNumber: "SC-2026-123456",
  agreementId: "agr_abc123",
  coverageAmount: 150_000,
  dateFrom: new Date("2026-06-01T09:30:00Z"),
  dateTo: new Date("2026-06-11T18:00:00Z"),
};

describe("readConfig / isEnabled (env-gated)", () => {
  it("is disabled with no signing secret", () => {
    expect(readConfig({})).toBeNull();
    expect(isEnabled({})).toBe(false);
  });

  it("enables with a mnemonic and defaults to testnet + toncenter testnet endpoint", () => {
    const cfg = readConfig({ TON_MNEMONIC: "word1 word2 word3" });
    expect(cfg).not.toBeNull();
    expect(cfg!.network).toBe("testnet");
    expect(cfg!.endpoint).toContain("testnet.toncenter.com");
  });

  it("honours mainnet + a custom endpoint", () => {
    const cfg = readConfig({
      TON_SIGNING_KEY: "a b c",
      TON_NETWORK: "mainnet",
      TON_ENDPOINT: "https://example.test/rpc",
    });
    expect(cfg!.network).toBe("mainnet");
    expect(cfg!.endpoint).toBe("https://example.test/rpc");
  });
});

describe("certificateHash", () => {
  it("is deterministic regardless of date time-of-day (day granularity)", () => {
    const a = certificateHash(policy);
    const b = certificateHash({
      ...policy,
      dateFrom: new Date("2026-06-01T23:59:00Z"),
      dateTo: new Date("2026-06-11T00:00:01Z"),
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any anchored field changes", () => {
    const base = certificateHash(policy);
    expect(certificateHash({ ...policy, coverageAmount: 200_000 })).not.toBe(base);
    expect(certificateHash({ ...policy, policyNumber: "SC-2026-000000" })).not.toBe(base);
  });

  it("contains NO personal data in its hash input (only minimal metadata)", () => {
    const json = canonicalJson(policy);
    // Only the five whitelisted keys — never names/emails/addresses.
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([
      "agreementId",
      "coverageAmount",
      "dateFrom",
      "dateTo",
      "policyNumber",
    ]);
    expect(json).not.toMatch(/email|name|address|@/i);
  });
});

describe("explorerUrl", () => {
  it("builds testnet + mainnet tonviewer links and null without a ref", () => {
    expect(explorerUrl("abc", "testnet")).toBe("https://testnet.tonviewer.com/transaction/abc");
    expect(explorerUrl("abc", "mainnet")).toBe("https://tonviewer.com/transaction/abc");
    expect(explorerUrl(null, "testnet")).toBeNull();
  });
});

describe("anchorPolicy (best-effort)", () => {
  it("is a no-op when disabled (no env): returns skipped, never throws", async () => {
    const result = await anchorPolicy(policy, {});
    expect(result).toEqual({ skipped: true, status: "skipped", ref: null, network: null });
  });

  it("never throws and reports failed when the SDK/network is unavailable", async () => {
    // Env is set (enabled) but @ton calls will fail against a bogus endpoint /
    // invalid mnemonic — anchorPolicy must swallow it and return failed.
    const result = await anchorPolicy(policy, {
      TON_MNEMONIC: "not a real mnemonic phrase",
      TON_NETWORK: "testnet",
      TON_ENDPOINT: "http://127.0.0.1:1/none",
    });
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.status).toBe("failed");
      expect(result.ref).toBeNull();
      expect(result.network).toBe("testnet");
    }
  });
});
