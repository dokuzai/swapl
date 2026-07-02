"use client";

// "Your travel profile" (DOK-146) — transparency surface for the AI travel
// profile. Shows the exact summary + sources the assistant uses, with
// Refresh (POST /api/assistant/profile/refresh) and Delete
// (DELETE /api/assistant/profile) so the user stays in control.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { TravelProfileData } from "@/lib/ai/travel-profile";

type State =
  | { phase: "loading" }
  | { phase: "ready"; profile: TravelProfileData }
  | { phase: "deleted" }
  | { phase: "error" };

export function TravelProfileSection() {
  const t = useT();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState<"refresh" | "delete" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant/profile")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: TravelProfileData) => !cancelled && setState({ phase: "ready", profile: p }))
      .catch(() => !cancelled && setState({ phase: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setBusy("refresh");
    try {
      const res = await fetch("/api/assistant/profile/refresh", { method: "POST" });
      if (!res.ok) throw new Error();
      setState({ phase: "ready", profile: (await res.json()) as TravelProfileData });
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const res = await fetch("/api/assistant/profile", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setState({ phase: "deleted" });
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="surface-card p-6 mb-6">
      <h2 className="font-display text-xl tracking-[-0.01em] mb-3">
        {t("account.travelProfile.title")}
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
        {t("account.travelProfile.lede")}
      </p>

      {state.phase === "loading" && (
        <div className="h-16 rounded-xl animate-pulse" style={{ background: "var(--cream-2)" }} />
      )}

      {state.phase === "error" && (
        <p className="text-sm" role="alert" style={{ color: "var(--destructive)" }}>
          {t("account.travelProfile.error")}
        </p>
      )}

      {state.phase === "deleted" && (
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>
          {t("account.travelProfile.deleted")}
        </p>
      )}

      {state.phase === "ready" && (
        <>
          <blockquote
            className="text-[15px] leading-relaxed rounded-xl px-4 py-3 mb-4"
            style={{ background: "var(--cream-2)" }}
          >
            {state.profile.summary}
          </blockquote>
          <div className="mb-4">
            <span
              className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5"
              style={{ color: "var(--navy-3)" }}
            >
              {t("account.travelProfile.sources")}
            </span>
            <ul className="flex flex-wrap gap-2">
              {state.profile.sourcesUsed.map((s) => (
                <li
                  key={s}
                  className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
                  style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--navy-3)" }}>
            {t("account.travelProfile.updated", {
              date: new Date(state.profile.updatedAt).toLocaleDateString(),
            })}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={refresh} disabled={busy !== null} className="pill-ghost text-sm">
              {busy === "refresh"
                ? t("account.travelProfile.refreshing")
                : t("account.travelProfile.refresh")}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="pill-ghost text-sm"
              style={{ color: "var(--destructive)" }}
            >
              {busy === "delete"
                ? t("account.travelProfile.deleting")
                : t("account.travelProfile.delete")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
