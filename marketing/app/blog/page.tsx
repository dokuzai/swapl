import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BLOG_POSTS } from "@/app/content/blog";
import { BlogBrowser } from "@/components/blog/blog-browser";

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
        <div className="wrap py-12 lg:py-16 max-w-6xl">
          <p className="kicker mb-3">The swapl blog</p>
          <h1 className="font-display text-5xl tracking-[-0.03em] leading-[1.02] font-medium">
            Keys for keys, explained.
          </h1>
          <p className="mt-5 text-[18px] leading-[1.5] max-w-2xl" style={{ color: "var(--navy-2)" }}>
            The real cost of travel, how insured swapping actually works, and where to swap into next.
          </p>

          <BlogBrowser posts={BLOG_POSTS} />
        </div>
      </main>
      <Footer />
    </>
  );
}
