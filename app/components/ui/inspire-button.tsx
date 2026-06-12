// "Get Inspired" entry-point pill (DOK-146). Server-safe: plain Link + inline
// sparkles stroke icon, styled like every other primary pill. Used on the
// dashboard header and next to the /listings browse chips.

import Link from "next/link";

export function InspireButton({ label }: { label: string }) {
  return (
    <Link href="/inspire" className="pill-primary inline-flex items-center gap-2">
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </svg>
      {label}
    </Link>
  );
}
