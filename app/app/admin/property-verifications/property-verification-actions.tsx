"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PropertyVerificationActions({
  id,
  notePlaceholder,
  approveLabel,
  rejectLabel,
}: {
  id: string;
  notePlaceholder: string;
  approveLabel: string;
  rejectLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  function fire(decision: "approve" | "reject") {
    start(async () => {
      const res = await fetch(`/api/admin/property-verifications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:w-64 shrink-0">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={notePlaceholder}
        className="w-full px-3 py-2 rounded-lg border outline-none text-sm"
        style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
      />
      <div className="flex gap-2">
        <button onClick={() => fire("approve")} className="pill-primary" disabled={pending}>
          {approveLabel}
        </button>
        <button onClick={() => fire("reject")} className="pill-ghost" disabled={pending}>
          {rejectLabel}
        </button>
      </div>
    </div>
  );
}
