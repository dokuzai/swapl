// DOK-196: the AI cost-bearing routes must gate on the DURABLE rate limiter
// (Upstash-backed, safe across serverless invocations), not the in-memory one
// an attacker can dodge by spreading requests across cold-start instances.
// Each route returns 429 when the limiter rejects, and keys the bucket per
// user with the documented limit/window.

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "u-1", email: "ana@swapl.test", name: "Ana" };

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionFromRequest: vi.fn(),
  checkRateLimitDurable: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  getSessionFromRequest: mocks.getSessionFromRequest,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDurable: mocks.checkRateLimitDurable }));
// The handlers import prisma + the AI libs at module load; stub them so the
// 429 short-circuit (which fires before any of these run) stays isolated.
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) } } }));
vi.mock("@/lib/ai/proposal-message", () => ({ draftProposalMessage: vi.fn() }));
vi.mock("@/lib/ai/listing-content", () => ({ draftListingCopy: vi.fn() }));
vi.mock("@/lib/ai/city-illustration", () => ({ generateCityArt: vi.fn() }));
vi.mock("@/lib/ai/affiliate-suggestions", () => ({ suggestAffiliateActivities: vi.fn() }));
vi.mock("@/lib/ai/suggestions", () => ({ getSuggestionsForUser: vi.fn() }));

import { POST as proposalMessage } from "@/app/api/ai/proposal-message/route";
import { POST as listingContent } from "@/app/api/ai/listing-content/route";
import { POST as cityIllustration } from "@/app/api/ai/city-illustration/route";
import { POST as affiliateSuggestions } from "@/app/api/ai/affiliate-suggestions/route";
import { GET as suggestions } from "@/app/api/ai/suggestions/route";

function req(body: unknown = {}) {
  return new Request("https://swapl.test/api/ai", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Each route: [label, invoke, expected durable-limiter key/limit/window].
const ROUTES: Array<[string, () => Promise<Response>, [string, number, number]]> = [
  ["proposal-message", () => proposalMessage(req()), [`ai:proposal:${session.userId}`, 20, 10 * 60_000]],
  ["listing-content", () => listingContent(req()), [`ai:listing:${session.userId}`, 20, 10 * 60_000]],
  ["city-illustration", () => cityIllustration(req()), [`ai:city:${session.userId}`, 30, 60_000]],
  ["affiliate-suggestions", () => affiliateSuggestions(req()), [`ai:affiliate:${session.userId}`, 10, 10 * 60_000]],
  ["suggestions", () => suggestions(), [`ai:suggest:${session.userId}`, 20, 60_000]],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.getSessionFromRequest.mockResolvedValue(session);
});

describe("AI routes: durable rate limiting (DOK-196)", () => {
  for (const [label, invoke, [key, limit, windowMs]] of ROUTES) {
    it(`${label}: uses the durable limiter with a per-user key`, async () => {
      mocks.checkRateLimitDurable.mockResolvedValue({ ok: true, remaining: 1, resetAt: 0 });
      await invoke();
      expect(mocks.checkRateLimitDurable).toHaveBeenCalledWith(key, limit, windowMs);
    });

    it(`${label}: returns 429 when the durable limiter rejects`, async () => {
      mocks.checkRateLimitDurable.mockResolvedValue({ ok: false, remaining: 0, resetAt: 0 });
      const res = await invoke();
      expect(res.status).toBe(429);
    });
  }
});
