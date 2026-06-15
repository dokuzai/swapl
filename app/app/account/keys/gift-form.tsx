"use client";

// Gift Keys to a verified friend (DOK-155). Keys are a gift, never a sale:
// the copy and the API both forbid buying or cashing out. Posts to
// /api/keys/gift, which enforces the verified-only check, the per-transfer /
// daily / monthly caps, and never overdraws the sender.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function GiftKeysForm({
  verified,
  maxPerTransfer,
  dailyCap,
}: {
  verified: boolean;
  maxPerTransfer: number;
  dailyCap: number;
}) {
  const t = useT();
  const router = useRouter();
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState(5);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    start(async () => {
      const res = await fetch("/api/keys/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: toUserId.trim(), amount }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        amount?: number;
        balanceAfter?: number;
        error?: string;
      };
      if (res.ok && j.ok) {
        setSuccess(t("keys.gift.success", { count: j.amount ?? amount, balance: j.balanceAfter ?? 0 }));
        setToUserId("");
        router.refresh();
        return;
      }
      if (res.status === 403) setError(t("keys.gift.errorVerified"));
      else if (res.status === 422 && /enough|balance/i.test(j.error ?? "")) setError(t("keys.gift.errorBalance"));
      else setError(t("keys.gift.errorGeneric"));
    });
  }

  const inputCls = "w-full px-3 py-2.5 rounded-lg border outline-none text-sm";
  const inputStyle = { borderColor: "var(--line)", background: "var(--card-bg)" } as const;

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("keys.gift.recipient")}
        </span>
        <input
          type="text"
          required
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          disabled={!verified || pending}
          className={inputCls}
          style={inputStyle}
        />
        <span className="block mt-1.5 text-xs" style={{ color: "var(--navy-3)" }}>
          {t("keys.gift.recipientHint")}
        </span>
      </label>

      <label className="block">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("keys.gift.amount")}
        </span>
        <input
          type="number"
          required
          min={1}
          max={maxPerTransfer}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(maxPerTransfer, Number(e.target.value) || 1)))}
          disabled={!verified || pending}
          className={inputCls}
          style={inputStyle}
        />
        <span className="block mt-1.5 text-xs" style={{ color: "var(--navy-3)" }}>
          {t("keys.gift.cap", { max: maxPerTransfer, daily: dailyCap })}
        </span>
      </label>

      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      {success && <p className="text-sm" style={{ color: "var(--pink)" }}>{success}</p>}
      {!verified && (
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>{t("keys.gift.errorVerified")}</p>
      )}

      <button type="submit" className="pill-primary" disabled={!verified || pending || !toUserId.trim()}>
        {pending ? t("keys.gift.sending") : t("keys.gift.send")}
      </button>
    </form>
  );
}
