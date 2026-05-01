// Provider-agnostic AI layer for swapl.
//
// We support:
//   - "kimi"     → Moonshot's Kimi (OpenAI-compatible API at api.moonshot.ai/v1)
//   - "openai"   → OpenAI's official chat completions API
//   - "anthropic"→ Anthropic Claude (messages API)
//
// Each call resolves a config in this priority order:
//   1. Per-user override (User.aiProvider / aiModel / aiApiKey)
//   2. Environment-wide default (AI_PROVIDER, AI_MODEL, AI_API_KEY)
//   3. Provider-specific env keys (KIMI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
//
// If no key is resolvable, callers must use a deterministic fallback.

import Anthropic from "@anthropic-ai/sdk";

export const PROVIDERS = ["kimi", "openai", "anthropic"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string> = {
  kimi: "kimi-k2-0905-preview",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  kimi: "Kimi (Moonshot)",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
};

export type ResolvedConfig = {
  provider: ProviderId;
  model: string;
  apiKey: string;
};

export type ResolveOptions = {
  userOverride?: { provider?: string | null; model?: string | null; apiKey?: string | null };
};

function envProviderId(): ProviderId | null {
  const raw = (process.env.AI_PROVIDER ?? "").toLowerCase();
  return (PROVIDERS as readonly string[]).includes(raw) ? (raw as ProviderId) : null;
}

function pickProviderKey(provider: ProviderId): string | null {
  switch (provider) {
    case "kimi":
      return process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? null;
    case "openai":
      return process.env.OPENAI_API_KEY ?? null;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ?? null;
  }
}

export function resolveAIConfig(opts: ResolveOptions = {}): ResolvedConfig | null {
  const userProvider = (opts.userOverride?.provider ?? "").toLowerCase();
  if ((PROVIDERS as readonly string[]).includes(userProvider)) {
    const provider = userProvider as ProviderId;
    const apiKey = opts.userOverride?.apiKey || pickProviderKey(provider) || process.env.AI_API_KEY || "";
    if (!apiKey) return null;
    return {
      provider,
      model: opts.userOverride?.model || PROVIDER_DEFAULT_MODELS[provider],
      apiKey,
    };
  }

  const envProvider = envProviderId() ?? "kimi"; // Kimi is the project default
  const envModel = process.env.AI_MODEL || PROVIDER_DEFAULT_MODELS[envProvider];
  const envKey = process.env.AI_API_KEY || pickProviderKey(envProvider);
  if (!envKey) return null;
  return { provider: envProvider, model: envModel, apiKey: envKey };
}

// ---- Generic chat-completion call ----

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  config: ResolvedConfig;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseJson?: boolean; // when true, ask for JSON-only output where the API supports it
};

export async function chat(opts: ChatOptions): Promise<string> {
  const { config, messages, maxTokens = 400, temperature = 0.4, responseJson } = opts;

  if (config.provider === "anthropic") {
    const client = new Anthropic({ apiKey: config.apiKey });
    const system = messages.find((m) => m.role === "system")?.content;
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    const out = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: turns,
    });
    return out.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
  }

  // OpenAI-compatible (kimi, openai)
  const baseUrl =
    config.provider === "kimi"
      ? process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"
      : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI ${config.provider} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}
