"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function VerifyForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/listings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, videoUrl }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else if (res.ok) {
        router.refresh();
      } else {
        setError(j.error ?? "Couldn't submit");
      }
    });
  }

  return (
    <form onSubmit={submit} className="surface-card p-6 space-y-4">
      <label className="block text-sm">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          Video walkthrough (Loom URL)
        </span>
        <input
          type="url"
          required
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.loom.com/share/…"
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
        <span className="block mt-1 text-xs" style={{ color: "var(--navy-3)" }}>
          60–120 seconds is enough. Show the entry, every room, the bathroom, the view, the WFH desk if you have one.
          File-upload (MP4 up to 500 MB) ships next.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>One-time €39 — refunded if rejected.</p>
        <button type="submit" disabled={pending} className="pill-primary">
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
    </form>
  );
}
