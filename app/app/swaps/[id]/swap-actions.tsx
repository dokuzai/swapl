"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { marketingUrl } from "@/lib/marketing/urls";

export default function SwapActions({
  proposalId,
  status,
  isProposer,
  canRespondAsTarget,
  canCounter,
  otherName,
  dateRange,
  currentDateFrom,
  currentDateTo,
}: {
  proposalId: string;
  status: string;
  isProposer: boolean;
  canRespondAsTarget: boolean;
  canCounter: boolean;
  otherName?: string | null;
  /** Pre-formatted (locale-aware) date range for the accept-confirm recap. */
  dateRange?: string;
  currentDateFrom: string;
  currentDateTo: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCounter, setShowCounter] = useState(false);
  // Accept confirm / insurance-consent step (section C). The accept network
  // call only fires after the user explicitly acknowledges the insurance.
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
  const [acked, setAcked] = useState(false);
  const [counterFrom, setCounterFrom] = useState(currentDateFrom);
  const [counterTo, setCounterTo] = useState(currentDateTo);
  const [counterMessage, setCounterMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function fire(body: object) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.refresh();
        setShowCounter(false);
        setShowAcceptConfirm(false);
        setAcked(false);
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? t("swaps.action.failed"));
      }
    });
  }

  if (status === "ACCEPTED") {
    return (
      <div className="text-sm" style={{ color: "var(--navy-2)" }}>
        {t("swaps.action.activeNote")}{" "}
        <a href="mailto:help@swapl.test" style={{ color: "var(--pink)" }}>
          {t("swaps.action.contactSupport")}
        </a>
        .
      </div>
    );
  }
  if (status === "DECLINED" || status === "WITHDRAWN") {
    return (
      <div className="text-sm" style={{ color: "var(--navy-3)" }}>
        {t("swaps.action.closed")}
      </div>
    );
  }

  const recapRange = dateRange ?? `${currentDateFrom} – ${currentDateTo}`;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}

      <div className="flex flex-wrap gap-3">
        {canRespondAsTarget && (
          <button
            onClick={() => {
              setAcked(false);
              setShowAcceptConfirm(true);
            }}
            className="pill-primary"
            disabled={pending}
          >
            {t("swaps.action.accept")}
          </button>
        )}
        {canRespondAsTarget && (
          <button onClick={() => fire({ action: "decline" })} className="pill-ghost" disabled={pending}>
            {t("swaps.action.decline")}
          </button>
        )}
        {canCounter && (
          <button onClick={() => setShowCounter((v) => !v)} className="pill-ghost" disabled={pending}>
            {showCounter ? t("swaps.action.counterCancel") : t("swaps.action.counter")}
          </button>
        )}
        {isProposer && (status === "PENDING" || status === "COUNTERED") && (
          <button onClick={() => fire({ action: "withdraw" })} className="pill-ghost" disabled={pending}>
            {t("swaps.action.withdraw")}
          </button>
        )}
      </div>

      {/* Accept / insurance-consent confirm step (section C). */}
      {showAcceptConfirm && (
        <div className="surface-card p-5 space-y-4" style={{ background: "var(--cream-2)" }}>
          <div>
            <h3 className="font-display text-xl tracking-[-0.01em]">{t("swaps.accept.confirmTitle")}</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--navy-2)" }}>
              {t("swaps.accept.recap", { name: otherName ?? "swapl host", dateRange: recapRange })}
            </p>
          </div>

          <div className="surface-card p-4" style={{ background: "var(--card-bg)" }}>
            <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--pink)" }}>
              {t("swaps.accept.insTitle")}
            </div>
            <p className="text-sm" style={{ color: "var(--navy-2)" }}>
              {t("swaps.accept.insBody")}
            </p>
            <a
              href={marketingUrl("/insurance")}
              target="_blank"
              rel="noreferrer"
              className="pill-ghost mt-3 inline-block"
            >
              {t("swaps.accept.insLink")}
            </a>
          </div>

          <p className="text-sm" style={{ color: "var(--navy-2)" }}>
            {t("swaps.accept.contactNote", { name: otherName ?? "swapl host" })}
          </p>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: "var(--navy)" }}>
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>{t("swaps.accept.ack")}</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => fire({ action: "accept" })}
              className="pill-primary"
              disabled={pending || !acked}
            >
              {pending ? t("swaps.action.sending") : t("swaps.accept.confirm")}
            </button>
            <button
              onClick={() => {
                setShowAcceptConfirm(false);
                setAcked(false);
              }}
              className="pill-ghost"
              disabled={pending}
            >
              {t("swaps.accept.cancel")}
            </button>
          </div>
        </div>
      )}

      {showCounter && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fire({
              action: "counter",
              counterDateFrom: counterFrom,
              counterDateTo: counterTo,
              counterMessage: counterMessage || undefined,
            });
          }}
          className="surface-card p-5 space-y-3"
          style={{ background: "var(--cream-2)" }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {t("swaps.action.counterFrom")}
              </span>
              <input
                type="date"
                required
                value={counterFrom}
                onChange={(e) => setCounterFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border outline-none"
                style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {t("swaps.action.counterTo")}
              </span>
              <input
                type="date"
                required
                value={counterTo}
                onChange={(e) => setCounterTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border outline-none"
                style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("swaps.action.message")}
            </span>
            <textarea
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border outline-none resize-none"
              style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
            />
          </label>
          <button type="submit" className="pill-primary" disabled={pending}>
            {pending ? t("swaps.action.sending") : t("swaps.action.counterSend")}
          </button>
        </form>
      )}
    </div>
  );
}
