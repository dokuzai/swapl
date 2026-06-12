"use client";

// Current admin section name in the navy topbar (DOK-151). Client-side only
// because a server layout cannot read the pathname; renders nothing on /admin
// itself (the badge + logo already say where you are).

import { usePathname } from "next/navigation";

export function AdminSectionTitle({ sections }: { sections: Array<{ href: string; label: string }> }) {
  const pathname = usePathname() ?? "";
  // Longest matching prefix wins so /admin/users/... maps to Users, not Overview.
  const current = sections
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!current || current.href === "/admin") return null;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span aria-hidden style={{ color: "color-mix(in oklab, var(--cream) 40%, transparent)" }}>/</span>
      <span
        className="font-mono text-[11px] uppercase tracking-[.12em] truncate"
        style={{ color: "color-mix(in oklab, var(--cream) 85%, transparent)" }}
      >
        {current.label}
      </span>
    </span>
  );
}
