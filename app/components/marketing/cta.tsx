"use client";

import { useState, useTransition } from "react";

export function CtaWaitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await fetch("/api/beta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error(await res.text());
        setStatus("ok");
        setEmail("");
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <section id="join" className="text-center py-28 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <h2
          className="font-display font-medium leading-[1.02] tracking-[-0.03em] mb-6 mx-auto max-w-[20ch] text-balance"
          style={{ fontSize: "clamp(40px, 5vw, 72px)" }}
        >
          Your home is worth<br />a thousand trips.
        </h2>
        <p className="mb-9 text-[18px]" style={{ color: "var(--navy-2)" }}>
          Early access opens May 2026. Listings from beta users surface first.
        </p>

        <form
          onSubmit={submit}
          className="inline-flex items-center gap-2 p-1.5 border rounded-full max-w-[480px] w-full"
          style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 bg-transparent border-0 px-5 py-3 outline-none"
            disabled={pending || status === "ok"}
          />
          <button type="submit" className="pill-primary" disabled={pending || status === "ok"}>
            {status === "ok" ? "On the list ✓" : pending ? "Sending…" : "Request invite"}
          </button>
        </form>

        {status === "error" && (
          <p className="mt-3 text-sm" style={{ color: "#dc2626" }}>
            Something went wrong. Try again in a moment.
          </p>
        )}

        <div className="mt-12 flex flex-wrap gap-6 justify-center font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          <span>◦ 92 countries</span>
          <span>◦ Insurance included</span>
          <span>◦ No host fees</span>
          <span>◦ No platform commission</span>
        </div>
      </div>
    </section>
  );
}
