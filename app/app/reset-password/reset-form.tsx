"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function ResetForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Those passwords don't match.");
    start(async () => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        router.replace("/dashboard?reset=ok");
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Couldn't reset. Try requesting a new link.");
      }
    });
  }

  if (!token) {
    return (
      <div className="surface-card p-8 max-w-md text-center">
        <h1 className="font-display text-2xl mb-3">Missing reset token.</h1>
        <p className="text-sm mb-5" style={{ color: "var(--navy-2)" }}>
          Open the link from the email we sent you, or request a new one.
        </p>
        <Link href="/forgot-password" className="pill-primary">Request a reset link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface-card p-8 max-w-md w-full">
      <p className="kicker mb-3">Reset password</p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">Pick a new one.</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        Choose a password you don&rsquo;t use anywhere else. Six characters minimum.
      </p>

      <label className="block text-sm mb-3">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          New password
        </span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>
      <label className="block text-sm mb-4">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          Confirm password
        </span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>
      {error && <p className="text-sm mb-3" style={{ color: "#dc2626" }}>{error}</p>}
      <button type="submit" disabled={pending} className="pill-primary w-full justify-center">
        {pending ? "Resetting…" : "Set new password"}
      </button>
    </form>
  );
}
