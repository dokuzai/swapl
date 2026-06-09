import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BLOG_POSTS, formatPostDate } from "@/app/content/blog";

export const metadata: Metadata = {
  title: "The swapl blog · home swapping, no money, fully insured",
  description:
    "Guides and honest numbers on home swapping — what it costs versus Airbnb, how insured swaps work, and where to swap into next.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "The swapl blog",
    description: "Home swapping, the real cost of travel, and how insured money-free swaps work.",
    url: "/blog",
    type: "website",
  },
};

export default function BlogIndex() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-12 lg:py-16 max-w-3xl">
          <p className="kicker mb-3">The swapl blog</p>
          <h1 className="font-display text-5xl tracking-[-0.03em] leading-[1.02] font-medium">
            Keys for keys, explained.
          </h1>
          <p className="mt-5 text-[18px] leading-[1.5] max-w-2xl" style={{ color: "var(--navy-2)" }}>
            The real cost of travel, how insured swapping actually works, and where to swap into next.
          </p>

          <div className="mt-12 grid gap-4">
            {BLOG_POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="surface-card block p-6 transition-colors hover:bg-[var(--cream-2)]"
              >
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
                  <span style={{ color: "var(--pink)" }}>{post.category}</span>
                  <span>·</span>
                  <span>{formatPostDate(post.publishedAt)}</span>
                  <span>·</span>
                  <span>{post.readingMinutes} min</span>
                </div>
                <h2 className="mt-3 font-display text-2xl tracking-[-0.01em] leading-snug font-medium">
                  {post.title}
                </h2>
                <p className="mt-2 text-[15px] leading-[1.55]" style={{ color: "var(--navy-2)" }}>
                  {post.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
