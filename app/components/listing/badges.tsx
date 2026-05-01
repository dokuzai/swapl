// Trust + visibility badges for listing cards and detail pages.
// Both are pure SVG so they nest cleanly inside link cards without breaking
// the rounded-2xl card shadow.

export function VerifiedBadge({ size = 22 }: { size?: number }) {
  return (
    <span
      title="Verified by swapl"
      aria-label="Verified by swapl"
      className="inline-grid place-items-center rounded-full"
      style={{ width: size, height: size, background: "var(--pink)", color: "#fff" }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" aria-hidden>
        <path d="M2 6 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function FeaturedRibbon() {
  return (
    <span
      className="absolute top-3 right-3 font-mono text-[10px] tracking-[.08em] uppercase px-2.5 py-1 rounded-full"
      style={{ background: "var(--pink-light)", color: "var(--pink)" }}
    >
      ★ Featured
    </span>
  );
}
