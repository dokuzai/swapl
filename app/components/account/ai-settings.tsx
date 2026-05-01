"use client";

import { useEffect, useState, useTransition } from "react";

const PROVIDERS = [
  { id: "kimi", label: "Kimi (Moonshot)", defaultModel: "kimi-k2-0905-preview" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic Claude", defaultModel: "claude-haiku-4-5-20251001" },
] as const;

export function AISettings() {
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((j) => {
        setProvider(j.provider ?? "");
        setModel(j.model ?? "");
        setHasKey(Boolean(j.hasKey));
      })
      .catch(() => {});
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    start(async () => {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey }),
      });
      if (res.ok) {
        setStatus("saved");
        setApiKey("");
        if (apiKey) setHasKey(true);
      } else setStatus("error");
    });
  }

  function clear() {
    start(async () => {
      const res = await fetch("/api/ai/settings", { method: "DELETE" });
      if (res.ok) {
        setProvider("");
        setModel("");
        setApiKey("");
        setHasKey(false);
        setStatus("saved");
      }
    });
  }

  const presetModel = PROVIDERS.find((p) => p.id === provider)?.defaultModel ?? "";

  return (
    <section className="surface-card p-6 mb-6">
      <h2 className="font-display text-xl tracking-[-0.01em] mb-3">AI provider</h2>
      <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
        Used to generate city covers when you list a home, and to personalise your homes-you&rsquo;d-love picks.
        Defaults to <span className="font-mono">Kimi</span>; override it here with your own provider and key.
      </p>

      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            Provider
          </span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          >
            <option value="">— project default —</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            Model
          </span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={presetModel || "e.g. kimi-k2-0905-preview"}
            className="w-full px-3 py-2.5 rounded-lg border outline-none font-mono"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
          {provider && (
            <span className="block mt-1 text-xs" style={{ color: "var(--navy-3)" }}>
              Leave blank to use the provider&rsquo;s default.
            </span>
          )}
        </label>

        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            API key {hasKey && <span style={{ color: "var(--pink)" }}>· stored</span>}
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? "•••• •••• •••• ••••" : "sk-…"}
            className="w-full px-3 py-2.5 rounded-lg border outline-none font-mono"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            autoComplete="off"
          />
          <span className="block mt-1 text-xs" style={{ color: "var(--navy-3)" }}>
            Stored on the server; never shown again. Leave blank to keep the existing key.
          </span>
        </label>

        {status === "saved" && (
          <p className="text-sm" style={{ color: "var(--pink)" }}>Saved.</p>
        )}
        {status === "error" && (
          <p className="text-sm" style={{ color: "#dc2626" }}>Couldn&rsquo;t save settings.</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="pill-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          {(provider || hasKey || model) && (
            <button type="button" onClick={clear} className="pill-ghost" disabled={pending}>
              Use project default
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
