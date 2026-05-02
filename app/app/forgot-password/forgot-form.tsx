"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";

export default function ForgotForm() {
  const t = useT();
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
        <p className="kicker mb-3">{t("auth.forgot.sentTitle")}</p>
        <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">{t("auth.forgot.sentTitle")}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
          {t("auth.forgot.sentBody")}
        </p>
        <Link href="/login" className="pill-ghost">{t("auth.forgot.backLogin")}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface-card p-8 max-w-md w-full">
      <p className="kicker mb-3">{t("auth.login.forgot")}</p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">{t("auth.forgot.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>
        {t("auth.forgot.lede")}
      </p>

      <label className="block text-sm mb-4">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          {t("auth.login.email")}
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
        {pending ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
      </button>
      <p className="mt-6 text-xs text-center" style={{ color: "var(--navy-3)" }}>
        <Link href="/login" className="font-medium" style={{ color: "var(--pink)" }}>{t("auth.forgot.backLogin")}</Link>
      </p>
    </form>
  );
}
