import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BLOG_POSTS, getBlogPost, formatPostDate } from "@/app/content/blog";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
    },
  };
}

export default async function BlogPostPage(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    author: { "@type": "Organization", name: "swapl" },
    publisher: { "@type": "Organization", name: "swapl" },
    mainEntityOfPage: { "@type": "WebPage", "@id": `/blog/${post.slug}` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <article className="wrap py-10 lg:py-14 max-w-2xl">
          <Link href="/blog" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← All posts
          </Link>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            <span style={{ color: "var(--pink)" }}>{post.category}</span>
            <span>·</span>
            <span>{formatPostDate(post.publishedAt)}</span>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
          </div>
          <h1 className="mt-3 font-display text-[clamp(34px,5vw,52px)] tracking-[-0.03em] leading-[1.05] font-medium text-balance">
            {post.title}
          </h1>
          <p className="mt-5 text-[19px] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            {post.hero}
          </p>

          <div className="mt-10 space-y-9">
            {post.sections.map((section) => (
              <section key={section.heading ?? section.body.slice(0, 24)}>
                {section.heading && (
                  <h2 className="font-display text-2xl tracking-[-0.01em] mb-3 font-medium">
                    {section.heading}
                  </h2>
                )}
                <div className="prose prose-sm max-w-none whitespace-pre-line text-[16px] leading-[1.65]" style={{ color: "var(--navy-2)" }}>
                  {section.body}
                </div>
              </section>
            ))}
          </div>

          {post.cta && (
            <div className="mt-12 surface-card p-6 flex flex-wrap items-center justify-between gap-4" style={{ background: "var(--cream-2)" }}>
              <p className="font-display text-xl tracking-[-0.01em]">Ready to swap?</p>
              <Link href={post.cta.href} className="pill-primary">
                {post.cta.label}
              </Link>
            </div>
          )}
        </article>
      </main>
      <Footer />
    </>
  );
}
