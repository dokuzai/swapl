"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const COPY: Record<string, { heading: string; body: string; tone: "ok" | "warn" }> = {
  ok: {
    heading: "You're verified.",
    body: "Your email is confirmed — every feature is unlocked. Welcome aboard.",
    tone: "ok",
  },
  expired: {
    heading: "That link has expired.",
    body: "Verification links work for 7 days. We can send a fresh one to your inbox.",
    tone: "warn",
  },
  used: {
    heading: "Link already used.",
    body: "This verification link has been consumed. Your email is already verified.",
    tone: "warn",
  },
  invalid: {
    heading: "Hmm, that link doesn't look right.",
    body: "Either it was tampered with or it never existed. Request a new one from /account.",
    tone: "warn",
  },
};

export default function VerifyResult() {
  const sp = useSearchParams();
  const status = sp.get("status") ?? "ok";
  const copy = COPY[status] ?? COPY.invalid;
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [pending, start] = useTransition();

  function resend() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setResent(true);
      else setError(j.error ?? "Couldn't resend — sign in first, then try again.");
    });
  }

  return (
    <div className="surface-card p-8 max-w-md text-center">
      <p className="kicker mb-3" style={{ color: copy.tone === "ok" ? "var(--pink)" : "var(--navy-3)" }}>
        Verification
      </p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">{copy.heading}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>{copy.body}</p>

      {copy.tone === "ok" ? (
        <Link href="/dashboard" className="pill-primary">Go to dashboard</Link>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button onClick={resend} disabled={pending || resent} className="pill-primary">
            {resent ? "Sent — check your inbox" : pending ? "Sending…" : "Resend verification email"}
          </button>
          {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
          <Link href="/login" className="font-mono text-xs uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            ← back to sign in
          </Link>
        </div>
      )}
    </div>
  );
}
