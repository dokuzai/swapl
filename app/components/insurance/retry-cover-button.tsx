"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Heals a policy stuck in "pending" (the underwriter call failed at accept
// time) by hitting POST /api/insurance/retry, then refreshing the swap page.
export function RetryCoverButton({ agreementId }: { agreementId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="pill-ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch("/api/insurance/retry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agreementId }),
            });
            if (res.ok) {
              router.refresh();
            } else {
              const j = await res.json().catch(() => ({}));
              setError(j.error ?? "Couldn't issue the policy. Try again shortly.");
            }
          });
        }}
      >
        {pending ? "Issuing…" : "Issue now"}
      </button>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  );
}
