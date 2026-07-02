"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";

const COPY: Record<string, { heading: DictKey; body: DictKey; tone: "ok" | "warn" }> = {
  ok: { heading: "verify.ok.heading", body: "verify.ok.body", tone: "ok" },
  expired: { heading: "verify.expired.heading", body: "verify.expired.body", tone: "warn" },
  used: { heading: "verify.used.heading", body: "verify.used.body", tone: "warn" },
  invalid: { heading: "verify.invalid.heading", body: "verify.invalid.body", tone: "warn" },
};

export default function VerifyResult() {
  const t = useT();
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
      else setError(j.error ?? t("verify.resendError"));
    });
  }

  return (
    <div className="surface-card p-8 max-w-md text-center">
      <p className="kicker mb-3" style={{ color: copy.tone === "ok" ? "var(--pink)" : "var(--navy-3)" }}>
        {t("verify.kicker")}
      </p>
      <h1 className="font-display text-3xl tracking-[-0.02em] mb-3">{t(copy.heading)}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--navy-2)" }}>{t(copy.body)}</p>

      {copy.tone === "ok" ? (
        <Link href="/dashboard" className="pill-primary">{t("verify.goDashboard")}</Link>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button onClick={resend} disabled={pending || resent} className="pill-primary">
            {resent ? t("verify.sent") : pending ? t("verify.sending") : t("verify.resend")}
          </button>
          {error && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}
          <Link href="/login" className="font-mono text-xs uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
            {t("verify.backToSignIn")}
          </Link>
        </div>
      )}
    </div>
  );
}
