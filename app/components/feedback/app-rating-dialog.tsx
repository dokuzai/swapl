"use client";

// App-experience feedback dialog (UX remediation — "rate the app", not the
// swap partner). Distinct from SwapReview (traveller→traveller). Posts to
// POST /api/app-feedback with a 1–5 score, optional comment, the client source
// tag ("web") and the originating surface/context so feedback is segmentable.
// All copy flows through the i18n dictionary (appFeedback.* keys).

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

const FACES = ["😣", "🙁", "😐", "🙂", "😍"] as const;

export type FeedbackSurface = "account" | "post-swap" | "post-review";
export type FeedbackContextLabel =
  | "account" | "negotiation" | "inbox" | "browse" | "publish" | "trip" | "other";

export function AppRatingDialog({
  open,
  onClose,
  surface = "account",
  contextKey = "",
  contextLabel = "account",
  context,
}: {
  open: boolean;
  onClose: () => void;
  surface?: FeedbackSurface;
  contextKey?: string;
  contextLabel?: FeedbackContextLabel;
  context?: Record<string, unknown>;
}) {
  const t = useT();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");

  if (!open) return null;

  function reset() {
    setScore(null);
    setComment("");
    setState("form");
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (score == null) return;
    setState("sending");
    try {
      const res = await fetch("/api/app-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          comment: comment.trim() || undefined,
          source: "web",
          surface,
          contextKey,
          context: { ...(context ?? {}), surfaceLabel: contextLabel },
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(20,16,28,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("appFeedback.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="surface-card w-full sm:max-w-md p-6 rounded-t-3xl sm:rounded-3xl"
        style={{ background: "var(--cream)" }}
      >
        {state === "done" ? (
          <div className="text-center py-4">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--pink-light)", color: "var(--pink)" }}
              aria-hidden
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="font-display text-2xl tracking-[-0.01em]">{t("appFeedback.successTitle")}</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>{t("appFeedback.successBody")}</p>
            <button onClick={close} className="pill-ghost mt-5">{t("appFeedback.dismiss")}</button>
          </div>
        ) : (
          <>
            <header className="mb-4">
              <h2 className="font-display text-2xl tracking-[-0.01em]">{t("appFeedback.title")}</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--navy-2)" }}>{t("appFeedback.subtitle")}</p>
            </header>

            {/* 1–5 emoji faces */}
            <div className="flex justify-between gap-2" role="radiogroup" aria-label={t("appFeedback.title")}>
              {FACES.map((face, i) => {
                const value = i + 1;
                const active = score === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(`appFeedback.face.${value}` as Parameters<typeof t>[0])}
                    onClick={() => setScore(value)}
                    className="flex-1 rounded-2xl py-3 text-2xl transition-transform"
                    style={{
                      background: active ? "var(--pink-light)" : "var(--cream-2)",
                      outline: active ? "2px solid var(--pink)" : "1px solid var(--line)",
                      transform: active ? "translateY(-2px)" : undefined,
                    }}
                  >
                    {face}
                  </button>
                );
              })}
            </div>
            {score != null && (
              <p className="mt-2 text-center text-sm font-medium" style={{ color: "var(--pink)" }}>
                {t(`appFeedback.face.${score}` as Parameters<typeof t>[0])}
              </p>
            )}

            {/* context chip + comment, revealed once a face is chosen */}
            {score != null && (
              <div className="mt-4 space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                  {t("appFeedback.contextFrom")} {t(`appFeedback.context.${contextLabel}` as Parameters<typeof t>[0])}
                </p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 600))}
                  rows={3}
                  placeholder={t("appFeedback.commentPlaceholder")}
                  className="w-full px-3 py-2 rounded-xl border outline-none resize-none text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
                />
              </div>
            )}

            {state === "error" && (
              <p className="mt-3 text-sm" style={{ color: "#dc2626" }}>{t("appFeedback.error")}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={close} className="pill-ghost" disabled={state === "sending"}>
                {t("appFeedback.dismiss")}
              </button>
              <button
                onClick={submit}
                className="pill-primary"
                disabled={score == null || state === "sending"}
              >
                {state === "sending" ? t("appFeedback.submitting") : t("appFeedback.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
