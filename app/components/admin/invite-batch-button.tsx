"use client";

// "Invite next batch" action for /admin/signups. Confirms, POSTs to the
// batch-invite endpoint and reports the result inline (same lightweight
// fetch-in-transition pattern as EmailTestButton).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InviteBatchButton({ remaining }: { remaining: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [pending, start] = useTransition();

  function invite() {
    const batch = Math.min(remaining, 50);
    if (!confirm(`Send beta invites to the next ${batch} waitlist signups?`)) return;
    setStatus(null);
    start(async () => {
      const res = await fetch("/api/admin/signups/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ kind: "ok", msg: `Invited ${j.invited} — ${j.remaining} remaining` });
        router.refresh();
      } else {
        setStatus({ kind: "error", msg: j.error ?? "Failed" });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={invite}
        disabled={pending || remaining === 0}
        className="inline-block font-mono text-[11px] uppercase tracking-[.1em] px-4 py-2 rounded-full disabled:opacity-50"
        style={{ background: "var(--navy)", color: "#fff" }}
      >
        {pending ? "Inviting…" : "Invite next batch →"}
      </button>
      {status && (
        <span className="text-xs" style={{ color: status.kind === "ok" ? "var(--pink)" : "#dc2626" }}>
          {status.msg}
        </span>
      )}
    </span>
  );
}
