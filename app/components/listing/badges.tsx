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

// Owner-verified trust badge (DOK-162). Discreet pill — a small key glyph plus
// label — shown when an admin has approved the host's optional ownership proof.
// Distinct from the pink VerifiedBadge (listing walkthrough verification).
export function OwnerVerifiedBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.08em]"
      style={{ background: "var(--cream-2)", color: "var(--navy-2)", border: "1px solid var(--line)" }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden style={{ color: "var(--pink)" }}>
        <circle cx="4" cy="4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.6 5.6 L10 10 M8.6 8.6 L9.8 7.4 M7.4 7.4 L8.4 6.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {label}
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
