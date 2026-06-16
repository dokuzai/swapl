"use client";

// "Leave a review" CTA + modal on the swap thread (DOK-147). Shown only when
// the server determined the caller canReview (agreement COMPLETED, no review
// from them yet). Stars 1–5 + textarea (20–1000 chars, matching the API),
// POST /api/agreements/{id}/review, then refresh the thread.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { AppRatingDialog } from "@/components/feedback/app-rating-dialog";
import { isAppFeedbackResolved, markAppFeedbackResolved } from "@/lib/feedback/app-feedback-guard";

export function LeaveReview({ agreementId, otherName }: { agreementId: string; otherName: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  // App-feedback prompt (DOK-190): on a successful traveller review, ask the
  // member to rate the app itself (surface="post-review").
  const [appFeedbackOpen, setAppFeedbackOpen] = useState(false);

  const valid = rating >= 1 && text.trim().length >= 20 && text.trim().length <= 1000;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setState("submitting");
    try {
      const res = await fetch(`/api/agreements/${agreementId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, text: text.trim() }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      // Chain into the app-feedback prompt (post-review surface) unless already
      // resolved on this device.
      if (!isAppFeedbackResolved("post-review", agreementId)) {
        setAppFeedbackOpen(true);
      }
      router.refresh();
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <section className="surface-card surface-card--static p-6 mb-6" style={{ background: "var(--pink-light)" }}>
        <p className="text-sm font-medium">{t("review.thanks")}</p>
        <AppRatingDialog
          open={appFeedbackOpen}
          onClose={() => setAppFeedbackOpen(false)}
          onResolved={() => markAppFeedbackResolved("post-review", agreementId)}
          surface="post-review"
          contextKey={agreementId}
          contextLabel="trip"
        />
      </section>
    );
  }

  return (
    <section className="surface-card surface-card--static p-6 mb-6">
      <h2 className="font-display text-xl tracking-[-0.01em] mb-2">{t("review.title")}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
        {t("review.lede", { name: otherName })}
      </p>
      {!open ? (
        <button type="button" className="pill-ghost" onClick={() => setOpen(true)}>
          {t("review.cta")}
        </button>
      ) : (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "color-mix(in oklab, var(--navy) 45%, transparent)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && state !== "submitting") setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-label={t("review.title")}
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--cream)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display text-2xl tracking-[-0.01em]">{t("review.title")}</h3>
              <button
                type="button"
                aria-label={t("ui.cancel")}
                onClick={() => setOpen(false)}
                className="text-xl leading-none"
                style={{ color: "var(--navy-3)" }}
              >
                ×
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
              {t("review.lede", { name: otherName })}
            </p>

            <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
              {t("review.ratingLabel")}
            </p>
            <div className="flex gap-1 mb-5" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={t("review.star", { n })}
                  aria-pressed={rating === n}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  className="text-3xl leading-none transition-transform hover:scale-110"
                  style={{ color: n <= (hovered || rating) ? "var(--pink)" : "var(--cream-2)" }}
                >
                  ★
                </button>
              ))}
            </div>

            <label className="block mb-4">
              <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-2" style={{ color: "var(--navy-3)" }}>
                {t("review.textLabel")}
              </span>
              <textarea
                rows={5}
                maxLength={1000}
                value={text}
                placeholder={t("review.placeholder")}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
              />
              {text.trim().length > 0 && text.trim().length < 20 && (
                <span className="text-xs mt-1 block" style={{ color: "var(--navy-3)" }}>
                  {t("review.minChars", { n: text.trim().length })}
                </span>
              )}
            </label>

            {state === "error" && (
              <p className="text-sm mb-3" style={{ color: "#dc2626" }}>
                {t("review.error")}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button type="button" className="pill-ghost" onClick={() => setOpen(false)}>
                {t("ui.cancel")}
              </button>
              <button
                type="submit"
                disabled={!valid || state === "submitting"}
                className="px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--navy)", color: "var(--cream)" }}
              >
                {state === "submitting" ? t("review.submitting") : t("review.submit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
