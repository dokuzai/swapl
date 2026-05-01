"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/lib/uploadthing";

// Hosts can either paste a Loom URL or upload an MP4/MOV ≤ 512 MB through
// Uploadthing. The submit handler is identical — we POST the resolved URL.
export default function VerifyForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

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
    <form onSubmit={submit} className="surface-card p-6 space-y-5">
      <div>
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          Option 1 · Upload a video
        </span>
        <UploadDropzone
          endpoint="verificationVideo"
          onClientUploadComplete={(res) => {
            const url = res?.[0]?.serverData?.url;
            if (url) {
              setVideoUrl(url);
              setUploadInfo(`Uploaded · ${url.replace(/^https?:\/\//, "").slice(0, 60)}…`);
            }
          }}
          onUploadError={(err) => setError(err.message)}
          appearance={{
            container: "ut-container border rounded-xl p-5 text-sm",
          }}
        />
        {uploadInfo && <p className="mt-1 text-xs font-mono" style={{ color: "var(--pink)" }}>{uploadInfo}</p>}
      </div>

      <div className="text-center text-xs uppercase tracking-[.1em] font-mono" style={{ color: "var(--navy-3)" }}>
        — or —
      </div>

      <label className="block text-sm">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          Option 2 · Paste a Loom URL
        </span>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.loom.com/share/…"
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
        <span className="block mt-1 text-xs" style={{ color: "var(--navy-3)" }}>
          60–120 seconds is enough. Show the entry, every room, the bathroom, the view, the WFH desk if you have one.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>One-time €39 — refunded if rejected.</p>
        <button type="submit" disabled={pending || !videoUrl} className="pill-primary">
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
    </form>
  );
}
