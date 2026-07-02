"use client";

import { useState, useTransition } from "react";

export function EmailTestButton({ defaultEmail }: { defaultEmail: string }) {
  const [to, setTo] = useState(defaultEmail);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [pending, start] = useTransition();
  function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    start(async () => {
      const res = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStatus({ kind: "ok", msg: `Sent via ${j.using ?? "transport"}` });
      else setStatus({ kind: "error", msg: j.error ?? "Failed" });
    });
  }
  return (
    <form onSubmit={send} className="surface-card p-5 flex items-center gap-3 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
        Email transport
      </span>
      <input
        type="email"
        required
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="px-3 py-2 rounded-lg border outline-none flex-1 min-w-[160px]"
        style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
      />
      <button type="submit" disabled={pending} className="pill-primary">
        {pending ? "Sending…" : "Send test email"}
      </button>
      {status && (
        <span className="text-xs" style={{ color: status.kind === "ok" ? "var(--pink)" : "var(--destructive)" }}>
          {status.msg}
        </span>
      )}
    </form>
  );
}
