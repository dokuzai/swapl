"use client";

// "Password" card on /account → Login & security (DOK-149): change the
// password in place (current + new + confirm) via POST
// /api/auth/change-password. Accounts without a password (social/OTP
// sign-ups) set their first one — no current-password field shown.

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

const inputCls = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";
const inputStyle = { borderColor: "var(--line)", background: "var(--card-bg)" } as const;

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // After a social/OTP account sets its first password the form flips into
  // "change" mode without waiting for a server refresh.
  const [hasPw, setHasPw] = useState(hasPassword);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (next.length < 6) {
      setNotice({ kind: "error", text: t("account.security.tooShort") });
      return;
    }
    if (next !== confirm) {
      setNotice({ kind: "error", text: t("account.security.mismatch") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(hasPw ? { currentPassword: current } : {}),
          newPassword: next,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({
          kind: "error",
          text: typeof j.error === "string" && j.error !== "UNAUTHENTICATED"
            ? j.error
            : t("account.security.changeError"),
        });
        return;
      }
      setNotice({ kind: "ok", text: t("account.security.changed") });
      setHasPw(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setNotice({ kind: "error", text: t("account.security.changeError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        {hasPw ? t("account.security.passwordBody") : t("account.security.setPasswordBody")}
      </p>

      {hasPw && (
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.security.currentPassword")}
          </span>
          <input
            type="password"
            className={inputCls}
            style={inputStyle}
            value={current}
            autoComplete="current-password"
            required
            maxLength={128}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.security.newPassword")}
          </span>
          <input
            type="password"
            className={inputCls}
            style={inputStyle}
            value={next}
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={128}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] block mb-1.5" style={{ color: "var(--navy-3)" }}>
            {t("account.security.confirmPassword")}
          </span>
          <input
            type="password"
            className={inputCls}
            style={inputStyle}
            value={confirm}
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={128}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="pill-ghost" disabled={busy}>
          {busy
            ? t("account.security.changing")
            : hasPw
              ? t("account.security.changeCta")
              : t("account.security.setCta")}
        </button>
        {notice && (
          <span
            role="status"
            className="text-sm"
            style={{ color: notice.kind === "ok" ? "var(--navy-2)" : "#dc2626" }}
          >
            {notice.text}
          </span>
        )}
      </div>
    </form>
  );
}
