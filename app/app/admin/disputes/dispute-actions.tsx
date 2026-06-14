"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["open", "investigating", "awaiting_response", "resolved", "closed"] as const;
type Status = (typeof STATUSES)[number];

export default function DisputeActions({
  disputeId,
  status,
}: {
  disputeId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<Status>(
    (STATUSES as readonly string[]).includes(status) ? (status as Status) : "investigating",
  );
  const [resolution, setResolution] = useState("");
  const [confirming, setConfirming] = useState(false);

  function post(body: Record<string, unknown>) {
    start(async () => {
      const res = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOpen(false);
        setConfirming(false);
        setResolution("");
        router.refresh();
      }
    });
  }

  function save() {
    if ((nextStatus === "resolved" || nextStatus === "closed") && !confirming) {
      setConfirming(true);
      return;
    }
    post({ status: nextStatus, resolution: resolution.trim() || undefined });
  }

  const terminal = status === "resolved" || status === "closed";

  if (!open) {
    return (
      <div className="flex flex-col gap-1.5">
        <button onClick={() => setOpen(true)} className="pill-primary" disabled={pending}>
          Manage
        </button>
        {!terminal && (
          <button
            onClick={() => post({ assignToMe: true })}
            className="pill-ghost"
            disabled={pending}
          >
            Assign to me
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <select
        value={nextStatus}
        onChange={(e) => {
          setNextStatus(e.target.value as Status);
          setConfirming(false);
        }}
        className="text-sm rounded-lg px-2 py-1"
        style={{ border: "1px solid color-mix(in oklab, var(--navy) 18%, transparent)" }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution / note (optional)"
        rows={2}
        className="text-sm rounded-lg px-2 py-1"
        style={{ border: "1px solid color-mix(in oklab, var(--navy) 18%, transparent)" }}
      />
      {confirming ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm" style={{ color: "var(--navy)" }}>
            Mark this dispute as <strong>{nextStatus}</strong>? This closes the case.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={save} className="pill-primary" disabled={pending}>
              Confirm {nextStatus}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="pill-ghost"
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={save} className="pill-primary" disabled={pending}>
            Save
          </button>
          <button
            onClick={() => post({ assignToMe: true })}
            className="pill-ghost"
            disabled={pending}
          >
            Assign me
          </button>
          <button onClick={() => setOpen(false)} className="pill-ghost" disabled={pending}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
