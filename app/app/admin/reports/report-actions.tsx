"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function fire(action: "resolve" | "dismiss") {
    const resolution = window.prompt(
      action === "resolve"
        ? "What action was taken? (optional note)"
        : "Why is no action needed? (optional note)"
    );
    if (resolution === null) return; // admin cancelled
    start(async () => {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resolution: resolution.trim() || undefined }),
      });
      if (res.ok) router.refresh();
    });
  }
  return (
    <div className="flex gap-2">
      <button onClick={() => fire("resolve")} className="pill-primary" disabled={pending}>Resolve</button>
      <button onClick={() => fire("dismiss")} className="pill-ghost" disabled={pending}>Dismiss</button>
    </div>
  );
}
