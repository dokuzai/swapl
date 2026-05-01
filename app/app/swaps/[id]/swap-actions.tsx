"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function SwapActions({
  proposalId,
  status,
  isProposer,
  canRespondAsTarget,
  canCounter,
  currentDateFrom,
  currentDateTo,
}: {
  proposalId: string;
  status: string;
  isProposer: boolean;
  canRespondAsTarget: boolean;
  canCounter: boolean;
  currentDateFrom: string;
  currentDateTo: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCounter, setShowCounter] = useState(false);
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
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Action failed");
      }
    });
  }

  if (status === "ACCEPTED") {
    return (
      <div className="text-sm" style={{ color: "var(--navy-2)" }}>
        Swap is active. Need to report a problem? <a href="mailto:help@swapl.test" style={{ color: "var(--pink)" }}>Contact support</a>.
      </div>
    );
  }
  if (status === "DECLINED" || status === "WITHDRAWN") {
    return (
      <div className="text-sm" style={{ color: "var(--navy-3)" }}>
        This proposal is closed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}

      <div className="flex flex-wrap gap-3">
        {canRespondAsTarget && (
          <button onClick={() => fire({ action: "accept" })} className="pill-primary" disabled={pending}>
            Accept &amp; insure
          </button>
        )}
        {canRespondAsTarget && (
          <button onClick={() => fire({ action: "decline" })} className="pill-ghost" disabled={pending}>
            Decline
          </button>
        )}
        {canCounter && (
          <button onClick={() => setShowCounter((v) => !v)} className="pill-ghost" disabled={pending}>
            {showCounter ? "Cancel counter" : "Counter offer"}
          </button>
        )}
        {isProposer && (status === "PENDING" || status === "COUNTERED") && (
          <button onClick={() => fire({ action: "withdraw" })} className="pill-ghost" disabled={pending}>
            Withdraw
          </button>
        )}
      </div>

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
                Counter from
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
                Counter to
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
              Message
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
            {pending ? "Sending…" : "Send counter"}
          </button>
        </form>
      )}
    </div>
  );
}
