"use client";

import { useState, useTransition } from "react";

export function ManageBillingButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function open() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.status === 503) {
        setError("Stripe isn't connected yet — billing portal will open at launch.");
      } else {
        setError(j.error ?? "Couldn't open the billing portal.");
      }
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={open} className="pill-ghost" disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {error && <span className="text-xs" style={{ color: "#dc2626" }}>{error}</span>}
    </div>
  );
}
