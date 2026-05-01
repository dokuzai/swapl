"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const OPTIONS: Array<{ value: "match" | "newest" | "size_desc" | "size_asc"; label: string }> = [
  { value: "match", label: "Match score ↓" },
  { value: "newest", label: "Newest" },
  { value: "size_desc", label: "Size ↓" },
  { value: "size_asc", label: "Size ↑" },
];

export default function SortControl() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = (sp.get("sort") ?? "match") as (typeof OPTIONS)[number]["value"];

  function setSort(value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value === "match") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="font-mono text-[11px] uppercase tracking-[.08em] flex items-center gap-2" style={{ color: "var(--navy-3)" }}>
      Sort:
      <select
        className="bg-transparent border-0 font-mono text-[11px] uppercase tracking-[.08em] outline-none"
        value={current}
        onChange={(e) => setSort(e.target.value)}
        style={{ color: "var(--navy)" }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
