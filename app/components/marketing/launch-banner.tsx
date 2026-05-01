// Top-of-page banner reminding visitors that we're pre-launch and the
// listing they create now ranks higher when swaps go live in September.

import Link from "next/link";

export function LaunchBanner() {
  return (
    <div
      className="border-b text-center py-2 px-4 text-sm"
      style={{
        background: "var(--pink-light)",
        borderColor: "var(--line)",
        color: "var(--navy)",
      }}
    >
      <span className="font-mono uppercase tracking-[.08em] text-[10px] mr-3" style={{ color: "var(--pink)" }}>
        Pre-launch
      </span>
      Collecting listings now — swaps go live <strong>September 2026</strong>.{" "}
      <Link href="/listings/new" className="underline font-medium" style={{ color: "var(--pink)" }}>
        List your home →
      </Link>
    </div>
  );
}
