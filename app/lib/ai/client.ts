// Anthropic client wrapper. When ANTHROPIC_API_KEY is unset, callers should
// fall through to deterministic helpers — never throw at request time.

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
