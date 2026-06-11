"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function UserActions({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function fire(action: "suspend" | "reactivate") {
    if (action === "suspend" && !window.confirm("Suspend this user? They will be unable to log in or send proposals.")) {
      return;
    }
    start(async () => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    });
  }
  return suspended ? (
    <button onClick={() => fire("reactivate")} className="pill-primary" disabled={pending}>Reactivate</button>
  ) : (
    <button onClick={() => fire("suspend")} className="pill-ghost" disabled={pending}>Suspend</button>
  );
}
