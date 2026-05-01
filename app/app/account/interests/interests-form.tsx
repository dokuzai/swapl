"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INTEREST_CATALOG, INTEREST_CATEGORIES } from "@/lib/interests";

const MAX_PICKED = 12;

export function InterestsForm({ initial, initialBio }: { initial: string[]; initialBio: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [vibe, setVibe] = useState(initialBio);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [pending, start] = useTransition();

  const grouped = useMemo(() => {
    const byCat = new Map<string, typeof INTEREST_CATALOG>();
    for (const t of INTEREST_CATALOG) {
      const arr = byCat.get(t.category) ?? [];
      arr.push(t);
      byCat.set(t.category, arr);
    }
    return byCat;
  }, []);

  function toggle(slug: string) {
    setStatus("idle");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else if (next.size < MAX_PICKED) next.add(slug);
      return next;
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/profile/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests: [...picked], bioVibe: vibe || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Couldn't save");
        return;
      }
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 space-y-3">
        <label className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            One-line vibe
          </span>
          <input
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            maxLength={160}
            placeholder="Slow mornings, espresso, vintage shops, quiet nights."
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
        <p className="text-xs" style={{ color: "var(--navy-3)" }}>
          Shown above your interests on /profile.
        </p>
      </section>

      <section className="surface-card p-6 space-y-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="font-display text-xl tracking-[-0.01em]">Interests · {picked.size}/{MAX_PICKED}</h2>
          <p className="text-xs" style={{ color: "var(--navy-3)" }}>
            Pick up to {MAX_PICKED}. Used for matching + recommendations.
          </p>
        </div>
        <div className="space-y-5">
          {INTEREST_CATEGORIES.map((cat) => {
            const items = grouped.get(cat.id) ?? [];
            if (!items.length) return null;
            return (
              <div key={cat.id}>
                <p className="font-mono text-[10px] uppercase tracking-[.12em] mb-2" style={{ color: "var(--navy-3)" }}>
                  {cat.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((t) => {
                    const on = picked.has(t.slug);
                    const disabled = !on && picked.size >= MAX_PICKED;
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => toggle(t.slug)}
                        disabled={disabled}
                        className="text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40"
                        style={
                          on
                            ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
                            : { background: "var(--card-bg)", color: "var(--navy-2)", borderColor: "var(--line)" }
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        {status === "saved" && <span className="text-sm" style={{ color: "var(--pink)" }}>Saved.</span>}
        {error && <span className="text-sm" style={{ color: "#dc2626" }}>{error}</span>}
        <button onClick={save} disabled={pending} className="pill-primary ml-auto">
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
