// Shared status pill for the swaps inbox + thread context panel (DOK-150).
export function StatusPill({ status, accent }: { status: string; accent?: boolean }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    PENDING: { label: "Pending", bg: "var(--cream-2)", fg: "var(--navy)" },
    COUNTERED: { label: "Countered", bg: "var(--pink-light)", fg: "var(--pink)" },
    ACCEPTED: {
      label: "Active swap",
      bg: accent ? "var(--pink)" : "var(--pink-light)",
      fg: accent ? "#fff" : "var(--pink)",
    },
    DECLINED: { label: "Declined", bg: "var(--cream-2)", fg: "var(--navy-3)" },
    WITHDRAWN: { label: "Withdrawn", bg: "var(--cream-2)", fg: "var(--navy-3)" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export function statusDotColor(status: string): string {
  switch (status) {
    case "ACCEPTED":
      return "var(--pink)";
    case "COUNTERED":
      return "var(--pink)";
    case "PENDING":
      return "var(--navy-2)";
    default:
      return "var(--navy-3)";
  }
}
