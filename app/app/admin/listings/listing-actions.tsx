"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ListingActions({
  listingId,
  active,
}: {
  listingId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function fire(action: "deactivate" | "reactivate") {
    if (action === "deactivate" && !window.confirm("Deactivate this listing? It will disappear from browse immediately.")) {
      return;
    }
    start(async () => {
      const res = await fetch(`/api/admin/listings/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    });
  }
  return active ? (
    <button onClick={() => fire("deactivate")} className="pill-ghost" disabled={pending}>Deactivate</button>
  ) : (
    <button onClick={() => fire("reactivate")} className="pill-primary" disabled={pending}>Reactivate</button>
  );
}
