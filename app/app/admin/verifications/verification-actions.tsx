"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function VerificationActions({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function fire(action: "approve" | "reject") {
    start(async () => {
      const res = await fetch(`/api/admin/verifications/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    });
  }
  return (
    <div className="flex gap-2">
      <button onClick={() => fire("approve")} className="pill-primary" disabled={pending}>Approve</button>
      <button onClick={() => fire("reject")} className="pill-ghost" disabled={pending}>Reject</button>
    </div>
  );
}
