"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";

export function ManageBillingButton() {
  const t = useT();
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
        setError(t("billing.portalUnavailable"));
      } else {
        setError(j.error ?? t("billing.portalError"));
      }
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={open} className="pill-ghost" disabled={pending}>
        {pending ? t("billing.opening") : t("billing.manageBilling")}
      </button>
      {error && <span className="text-xs" style={{ color: "#dc2626" }}>{error}</span>}
    </div>
  );
}
