"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show success — the API never confirms whether the email
      // exists, on purpose.
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="surface-card p-8 max-w-md text-center">
        <p className="kicker mb-3">Check your inbox</p>
        <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">Reset link on its way.</h1>
        <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
          If <b>{email}</b> matches an account, we&rsquo;ve emailed a reset link. It works for one
          hour. No email arriving? Check spam, then try again.
        </p>
        <Link href="/login" className="pill-ghost">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface-card p-8 max-w-md w-full">
      <p className="kicker mb-3">Forgot password</p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">Reset by email.</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        Enter the email you signed up with — we&rsquo;ll send a one-time link valid for an hour.
      </p>

      <label className="block text-sm mb-4">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>
      <button type="submit" className="pill-primary w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="mt-6 text-xs text-center" style={{ color: "var(--navy-3)" }}>
        Remembered it? <Link href="/login" className="font-medium" style={{ color: "var(--pink)" }}>Sign in</Link>
      </p>
    </form>
  );
}
