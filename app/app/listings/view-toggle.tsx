"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function ViewToggle({ current }: { current: "grid" | "map" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function set(view: "grid" | "map") {
    const next = new URLSearchParams(sp.toString());
    if (view === "grid") next.delete("view");
    else next.set("view", view);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }
  const opts: Array<{ id: "grid" | "map"; label: string }> = [
    { id: "grid", label: "Grid" },
    { id: "map", label: "Map" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex p-0.5 rounded-full border"
      style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
    >
      {opts.map((o) => {
        const on = o.id === current;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => set(o.id)}
            className="px-4 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-[.08em] transition-colors"
            style={
              on
                ? { background: "var(--pink)", color: "#fff" }
                : { color: "var(--navy-2)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
