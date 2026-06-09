"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BlogPost } from "@/app/content/blog";
import { formatPostDate } from "@/app/content/blog";

type SortKey = "newest" | "oldest" | "quickest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "quickest", label: "Quick reads" },
];

export function BlogBrowser({ posts }: { posts: BlogPost[] }) {
  const [city, setCity] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");

  // City toggles derived from the posts themselves.
  const cities = useMemo(
    () => Array.from(new Set(posts.flatMap((p) => p.cities))).sort(),
    [posts]
  );

  const visible = useMemo(() => {
    const filtered = city ? posts.filter((p) => p.cities.includes(city)) : posts;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "quickest") return a.readingMinutes - b.readingMinutes;
      const cmp = a.publishedAt.localeCompare(b.publishedAt);
      return sort === "oldest" ? cmp : -cmp;
    });
    return sorted;
  }, [posts, city, sort]);

  return (
    <div>
      {/* Controls */}
      <div className="mt-10 flex flex-col gap-4 border-y py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--line)" }}>
        {/* City toggles */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by city">
          <Toggle active={city === null} onClick={() => setCity(null)}>
            All
          </Toggle>
          {cities.map((c) => (
            <Toggle key={c} active={city === c} onClick={() => setCity(c)}>
              {c}
            </Toggle>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            Sort
          </span>
          <div className="flex items-center gap-1">
            {SORTS.map((s) => (
              <Toggle key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                {s.label}
              </Toggle>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
        {visible.length} {visible.length === 1 ? "post" : "posts"}
        {city ? ` in ${city}` : ""}
      </p>

      {/* Tiles */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="surface-card group flex flex-col p-6 transition-colors hover:bg-[var(--cream-2)]"
          >
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
              <span style={{ color: "var(--pink)" }}>{post.category}</span>
              <span>·</span>
              <span>{post.readingMinutes} min</span>
            </div>
            <h2 className="mt-3 font-display text-[22px] leading-[1.2] tracking-[-0.01em] font-medium">
              {post.title}
            </h2>
            <p className="mt-2 flex-1 text-[14px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
              {post.description}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {post.cities.map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--pink-light)", color: "var(--pink)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
                {formatPostDate(post.publishedAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-10 text-center text-[15px]" style={{ color: "var(--navy-2)" }}>
          No posts for {city} yet — check back soon.
        </p>
      )}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors"
      style={{
        borderColor: active ? "var(--navy)" : "var(--line)",
        background: active ? "var(--navy)" : "transparent",
        color: active ? "var(--cream)" : "var(--navy-2)",
      }}
    >
      {children}
    </button>
  );
}
