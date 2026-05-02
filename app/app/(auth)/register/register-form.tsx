"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export default function RegisterForm() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not create account");
      }
    });
  }

  return (
    <div className="w-full max-w-md surface-card p-8">
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-2">{t("auth.register.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        {t("auth.register.lede")}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="block text-sm">
          <span className="block mb-1.5 font-medium">{t("auth.login.email")}</span>
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
          <span className="block mb-1.5 font-medium">{t("auth.login.password")}</span>
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
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
        <button type="submit" className="pill-primary justify-center" disabled={pending}>
          {pending ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-6 text-sm" style={{ color: "var(--navy-2)" }}>
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-medium" style={{ color: "var(--pink)" }}>
          {t("auth.login.submit")}
        </Link>
      </p>
    </div>
  );
}
