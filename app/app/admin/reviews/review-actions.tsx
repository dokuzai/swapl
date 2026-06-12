"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ReviewActions({
  reviewId,
  status,
}: {
  reviewId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function fire(action: "hide" | "restore") {
    start(async () => {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    });
  }
  return (
    <div className="flex gap-2">
      {status === "published" ? (
        <button onClick={() => fire("hide")} className="pill-ghost" disabled={pending}>
          Hide
        </button>
      ) : (
        <button onClick={() => fire("restore")} className="pill-primary" disabled={pending}>
          Restore
        </button>
      )}
    </div>
  );
}
