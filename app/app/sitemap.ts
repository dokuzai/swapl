import type { MetadataRoute } from "next";
import { CITY_GUIDES } from "@/app/content/city-guides";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPaths: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
    { path: "", priority: 1, changeFrequency: "daily" },
    { path: "/listings", priority: 0.9, changeFrequency: "daily" },
    { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.7, changeFrequency: "monthly" },
    { path: "/insurance", priority: 0.6, changeFrequency: "monthly" },
    { path: "/corporate", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.4, changeFrequency: "monthly" },
    { path: "/register", priority: 0.5, changeFrequency: "monthly" },
    { path: "/login", priority: 0.3, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.2, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "monthly" },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  const guideEntries: MetadataRoute.Sitemap = Object.keys(CITY_GUIDES).map((slug) => ({
    url: `${BASE}/guides/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...guideEntries];
}
