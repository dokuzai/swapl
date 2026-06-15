"use client";

// "Verify your identity" dashboard card (Didit KYC).
//
// Rendered by the dashboard only when Didit is configured server-side and the
// user isn't verified yet. The button opens a hosted verification session
// (POST /api/verification/session) and redirects the browser to it; Didit
// sends the user back to /dashboard?verification=done, where the server has
// already re-polled the status before rendering us.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export type IdentityVerificationStatus = "none" | "pending" | "approved" | "declined" | "expired";

type ReferralReward = { keys: number; referrerName: string | null };

export function IdentityVerificationCard({ status }: { status: IdentityVerificationStatus }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reward, setReward] = useState<ReferralReward | null>(null);

  // Post-verify referral toast (DOK-157): when this user just got verified and
  // a referral reward paid out, the status endpoint reports it. We show it once
  // per mount. Best-effort — a failed/empty fetch simply renders no toast.
  useEffect(() => {
    if (status !== "approved") return;
    let cancelled = false;
    fetch("/api/verification/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.referralReward?.keys > 0) setReward(j.referralReward);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  const rewardToast = reward ? (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-sm shadow-lg"
      style={{ background: "var(--navy)", color: "var(--cream)" }}
      onClick={() => setReward(null)}
    >
      {reward.referrerName
        ? t("verifyId.referralToastNamed", { keys: reward.keys, name: reward.referrerName })
        : t("verifyId.referralToast", { keys: reward.keys })}
    </div>
  ) : null;

  function begin() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/verification/session", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url as string;
        return;
      }
      if (res.ok && j.status === "approved") {
        router.refresh();
        return;
      }
      setError(t("verifyId.error"));
    });
  }

  const pill = (label: string, bg: string, fg: string) => (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );

  if (status === "approved") {
    return (
      <>
        {rewardToast}
        <section className="surface-card p-6 mb-12">
          <div className="flex items-center gap-3">
            {pill(t("verifyId.approvedLabel"), "var(--pink)", "#fff")}
            <span className="text-sm" style={{ color: "var(--navy-2)" }}>
              {t("verifyId.approvedBody")}
            </span>
          </div>
        </section>
      </>
    );
  }

  const body =
    status === "pending"
      ? t("verifyId.pendingBody")
      : status === "declined"
        ? t("verifyId.declinedBody")
        : status === "expired"
          ? t("verifyId.expiredBody")
          : t("verifyId.body");

  const cta =
    status === "pending"
      ? t("verifyId.resume")
      : status === "declined" || status === "expired"
        ? t("verifyId.retry")
        : t("verifyId.cta");

  return (
    <section className="surface-card p-6 mb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-display text-xl tracking-[-0.01em]">{t("verifyId.title")}</h2>
            {status === "pending" && pill(t("verifyId.pendingLabel"), "var(--cream-2)", "var(--navy-3)")}
            {status === "declined" && pill(t("verifyId.declinedLabel"), "#dc2626", "#fff")}
          </div>
          <p className="text-sm" style={{ color: "var(--navy-2)" }}>{body}</p>
          {error && (
            <p className="text-xs mt-2" style={{ color: "#dc2626" }}>{error}</p>
          )}
        </div>
        <button onClick={begin} disabled={pending} className="pill-primary shrink-0">
          {pending ? t("verifyId.starting") : cta}
        </button>
      </div>
    </section>
  );
}
