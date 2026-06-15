"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

type Item = { id: string; name: string; query: string; alertEnabled: boolean; createdAt: string };

export function SavedSearchTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query: cleanQuery(query) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setName("");
        setQuery("");
        router.refresh();
      } else {
        setError(j.error ?? t("savedSearch.saveError"));
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="surface-card p-5 space-y-3">
        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>{t("savedSearch.name")}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("savedSearch.namePlaceholder")}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            {t("savedSearch.queryLabel")}
          </span>
          <input
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="city=Lisbon&wfh=1&minSqm=60"
            className="w-full px-3 py-2.5 rounded-lg border outline-none font-mono text-xs"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
        <button type="submit" disabled={pending} className="pill-primary">
          {pending ? t("savedSearch.saving") : t("savedSearch.save")}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>{t("savedSearch.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="surface-card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-base tracking-[-0.01em]">{it.name}</div>
                <Link
                  href={`/listings?${it.query}`}
                  className="text-xs font-mono truncate block max-w-md"
                  style={{ color: "var(--pink)" }}
                >
                  ?{it.query}
                </Link>
              </div>
              <button onClick={() => remove(it.id)} className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {t("savedSearch.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function cleanQuery(q: string): string {
  return q.replace(/^[\?#]+/, "").trim();
}
