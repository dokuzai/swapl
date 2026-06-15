// DOK-156 — "Verified on TON" proof-of-cover badge.
//
// Presentational only. It NEVER imports the server-only TON lib; callers pass in
// the already-resolved DTO fields (onChainStatus/onChainRef/explorerUrl) plus
// translated label strings. Renders nothing unless the policy is actually
// anchored on-chain — no anxious "pending" state, graceful no-op when anchoring
// is disabled (env-gated server side leaves these fields null).

type ProofOfCoverBadgeProps = {
  /** "anchored" once the certificate hash is on-chain; null/anything else → hidden. */
  onChainStatus: string | null | undefined;
  /** On-chain transaction reference; presence is the other anchor signal. */
  onChainRef: string | null | undefined;
  /** Explorer deep-link from the DTO (testnet/​mainnet tonviewer). May be null. */
  explorerUrl: string | null | undefined;
  /** Translated strings, resolved by the caller's t()/useT(). */
  labels: {
    /** Badge title, e.g. "Verified on TON". */
    badge: string;
    /** One-line reassurance for non-technical users. */
    blurb: string;
    /** Explorer link label, e.g. "View proof". */
    view: string;
  };
  /** Visual tone — "light" for navy/cream cards, "dark" for cream-on-navy. */
  tone?: "light" | "dark";
  className?: string;
};

function isAnchored(status: string | null | undefined, ref: string | null | undefined): boolean {
  return status === "anchored" || Boolean(ref);
}

export function ProofOfCoverBadge({
  onChainStatus,
  onChainRef,
  explorerUrl,
  labels,
  tone = "light",
  className,
}: ProofOfCoverBadgeProps) {
  // Graceful degradation: show nothing at all when not anchored.
  if (!isAnchored(onChainStatus, onChainRef)) return null;

  const muted =
    tone === "dark"
      ? "color-mix(in oklab, var(--cream) 70%, transparent)"
      : "var(--navy-2)";
  const accent = tone === "dark" ? "var(--cream)" : "var(--navy)";

  return (
    <div className={className}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[.08em]"
        style={{
          background:
            tone === "dark"
              ? "color-mix(in oklab, var(--cream) 14%, transparent)"
              : "color-mix(in oklab, var(--navy) 8%, transparent)",
          color: accent,
        }}
      >
        <LockIcon />
        {labels.badge}
      </span>
      {/* Blurb first and prominent — read before the secondary link on narrow screens. */}
      <p className="mt-2 text-xs leading-snug" style={{ color: accent }}>
        {labels.blurb}
      </p>
      {/* Secondary, de-emphasized explorer link below the blurb. */}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
          style={{ color: muted }}
        >
          {labels.view}
          <span aria-hidden>↗</span>
        </a>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
