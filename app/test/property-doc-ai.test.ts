// DOK-186 — AI property-document analysis + decision policy (unit level).
//
// Covers the env-gating contract (no key / non-vision provider → uncertain +
// aiDisabled, never throws) and the pure outcome policy that maps an AI proposal
// onto the verification status + listing side effects.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyPropertyDocument } from "@/lib/ai/property-doc";
import {
  decideVerificationOutcome,
  BUSINESS_INELIGIBLE_REASON,
} from "@/lib/listing/property-eligibility";
import type { PropertyDocResult } from "@/lib/ai/property-doc";

const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "KIMI_API_KEY",
  "MOONSHOT_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PROPERTY_AI_AUTO_APPROVE_OWNER",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of AI_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of AI_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("classifyPropertyDocument env-gating", () => {
  it("with no AI key → uncertain + aiDisabled, no throw", async () => {
    const res = await classifyPropertyDocument({
      documentUrls: ["https://x.test/deed.jpg"],
    });
    expect(res.aiDisabled).toBe(true);
    expect(res.classification).toBe("uncertain");
    expect(res.confidence).toBe(0);
    expect(res.source).toBe("disabled");
  });

  it("with a TEXT-ONLY provider (kimi) → degrades to uncertain + aiDisabled", async () => {
    process.env.AI_PROVIDER = "kimi";
    process.env.KIMI_API_KEY = "sk-test";
    const res = await classifyPropertyDocument({
      documentUrls: ["https://x.test/deed.jpg"],
    });
    // kimi is not wired for vision here → graceful degradation, never an error.
    expect(res.aiDisabled).toBe(true);
    expect(res.classification).toBe("uncertain");
  });

  it("with no documents → disabled (nothing to analyse)", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const res = await classifyPropertyDocument({ documentUrls: [] });
    expect(res.aiDisabled).toBe(true);
  });
});

function aiResult(over: Partial<PropertyDocResult>): PropertyDocResult {
  return {
    classification: "uncertain",
    confidence: 0,
    entityType: "unknown",
    reasons: [],
    source: "ai",
    ...over,
  };
}

describe("decideVerificationOutcome (DOK-186 policy)", () => {
  it("aiDisabled → pending, no side effects (pure DOK-162)", () => {
    const o = decideVerificationOutcome(aiResult({ aiDisabled: true, source: "disabled" }));
    expect(o.status).toBe("pending");
    expect(o.setOwnerVerified).toBe(false);
    expect(o.markIneligible).toBe(false);
  });

  it("uncertain → pending for manual review", () => {
    const o = decideVerificationOutcome(aiResult({ classification: "uncertain", confidence: 0.9 }));
    expect(o.status).toBe("pending");
    expect(o.markIneligible).toBe(false);
  });

  it("confident business → rejected + markIneligible", () => {
    const o = decideVerificationOutcome(
      aiResult({ classification: "business", confidence: 0.9, entityType: "company" })
    );
    expect(o.status).toBe("rejected");
    expect(o.markIneligible).toBe(true);
    expect(BUSINESS_INELIGIBLE_REASON).toBe("business_property");
  });

  it("low-confidence business → pending, no flag", () => {
    const o = decideVerificationOutcome(aiResult({ classification: "business", confidence: 0.4 }));
    expect(o.status).toBe("pending");
    expect(o.markIneligible).toBe(false);
  });

  it("private_owner → pending by default (admin confirms)", () => {
    const o = decideVerificationOutcome(aiResult({ classification: "private_owner", confidence: 0.99 }));
    expect(o.status).toBe("pending");
    expect(o.setOwnerVerified).toBe(false);
  });

  it("private_owner high-confidence + auto-approve flag → approved + ownerVerified", () => {
    process.env.PROPERTY_AI_AUTO_APPROVE_OWNER = "1";
    const o = decideVerificationOutcome(aiResult({ classification: "private_owner", confidence: 0.99 }));
    expect(o.status).toBe("approved");
    expect(o.setOwnerVerified).toBe(true);
    expect(o.badge).toBe("owner_verified");
  });

  it("private_tenant → never sets ownerVerified; tenant badge only when auto-approving", () => {
    const pending = decideVerificationOutcome(
      aiResult({ classification: "private_tenant", confidence: 0.99 })
    );
    expect(pending.status).toBe("pending");
    expect(pending.setOwnerVerified).toBe(false);

    process.env.PROPERTY_AI_AUTO_APPROVE_OWNER = "1";
    const approved = decideVerificationOutcome(
      aiResult({ classification: "private_tenant", confidence: 0.99 })
    );
    expect(approved.status).toBe("approved");
    expect(approved.setOwnerVerified).toBe(false);
    expect(approved.badge).toBe("tenant_verified");
  });
});
