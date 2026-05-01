"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Invalid email or password");
      }
    });
  }

  return (
    <div className="w-full max-w-md surface-card p-8">
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-2">Welcome back.</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        Sign in to manage your listing and swap proposals.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="block text-sm">
          <span className="block mb-1.5 font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1.5 font-medium">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
        <button type="submit" className="pill-primary justify-center" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm" style={{ color: "var(--navy-2)" }}>
        New here?{" "}
        <Link href="/register" className="font-medium" style={{ color: "var(--pink)" }}>
          Create an account
        </Link>
      </p>

      <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--navy-3)" }}>
        Demo accounts: any seed email + password <code className="font-mono">swapl-demo</code>. Try{" "}
        <code className="font-mono">asli@demo.swapl</code> or <code className="font-mono">maartje@demo.swapl</code>.
      </p>
    </div>
  );
}
