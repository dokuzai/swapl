"use client";

import { useState, useTransition } from "react";

// Pre-launch we never block the app on email verification — we just nudge.
// Set the resend-cap on the API side; here we just let the user try.
export function VerifyEmailBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function resend() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) setStatus("sent");
      else {
        const j = await res.json().catch(() => ({}));
        setStatus("error");
        setError(j.error ?? "Couldn't resend.");
      }
    });
  }

  return (
    <div
      className="mb-6 rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      style={{ background: "var(--pink-light)", borderColor: "var(--pink-light)" }}
    >
      <div className="text-sm" style={{ color: "var(--navy)" }}>
        <span
          className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full mr-2 align-middle"
          style={{ background: "var(--pink)", color: "#fff" }}
        >
          Verify
        </span>
        Confirm your email at <b>{email}</b> to unlock everything. The link in your inbox works for 7 days.
      </div>
      {status === "sent" ? (
        <span className="text-sm font-medium" style={{ color: "var(--pink)" }}>
          ✓ Email resent
        </span>
      ) : (
        <button onClick={resend} disabled={pending} className="pill-ghost shrink-0">
          {pending ? "Sending…" : "Resend email"}
        </button>
      )}
      {error && <span className="text-xs sm:ml-3" style={{ color: "#dc2626" }}>{error}</span>}
    </div>
  );
}
