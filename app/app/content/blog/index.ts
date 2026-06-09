// Static blog posts bundled with the build. Each post is a structured document
// the /blog and /blog/[slug] routes render inside the swapl chrome. Same pattern
// as app/content/city-guides.

import lisbonCost from "./home-swap-vs-airbnb-month-in-lisbon.json";
import safety from "./is-home-swapping-safe.json";
import amsterdam from "./best-amsterdam-neighbourhoods-to-swap-into.json";

export type BlogSection = {
  heading?: string;
  body: string; // markdown-light, line breaks preserved
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string; // ISO date (YYYY-MM-DD)
  readingMinutes: number;
  hero: string;
  sections: BlogSection[];
  cta?: { label: string; href: string };
};

// Newest first.
export const BLOG_POSTS: BlogPost[] = [
  lisbonCost as BlogPost,
  safety as BlogPost,
  amsterdam as BlogPost,
].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

export function formatPostDate(iso: string): string {
  // Deterministic, locale-independent date label (no Intl/timezone surprises).
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}
