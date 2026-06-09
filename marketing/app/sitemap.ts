import type { MetadataRoute } from "next";
import { CITY_GUIDES } from "@/app/content/city-guides";
import { CITY_LAUNCH_PAGES } from "@/lib/marketing/city-launch";
import { CORRIDORS } from "@/lib/marketing/corridors";
import { BLOG_POSTS } from "@/app/content/blog";
import { siteUrl } from "@/lib/app-url";

// Marketing-domain routes only. Product routes (/listings, /login,
// /register, ...) live on app.swapl.fun and are covered by its own sitemap.
const STATIC_ROUTES = [
  "",
  "/pricing",
  "/insurance",
  "/corporate",
  "/how-it-works",
  "/contact",
  "/privacy",
  "/terms",
  "/blog",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const cityRoutes = Object.keys(CITY_GUIDES).map((slug) => ({
    url: siteUrl(`/guides/${slug}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  const launchCityRoutes = CITY_LAUNCH_PAGES.map((page) => ({
    url: siteUrl(`/${page.slug}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));
  const corridorRoutes = CORRIDORS.map((corridor) => ({
    url: siteUrl(`/swap/${corridor.slug}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  const blogRoutes = BLOG_POSTS.map((post) => ({
    url: siteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    ...STATIC_ROUTES.map((path) => ({
      url: siteUrl(path),
      lastModified: now,
      changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : 0.8,
    })),
    ...launchCityRoutes,
    ...corridorRoutes,
    ...blogRoutes,
    ...cityRoutes,
  ];
}
