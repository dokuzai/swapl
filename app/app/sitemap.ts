import type { MetadataRoute } from "next";
import { CITY_GUIDES } from "@/app/content/city-guides";
import { CITY_LAUNCH_PAGES } from "@/lib/marketing/city-launch";

const STATIC_ROUTES = [
  "",
  "/listings",
  "/pricing",
  "/insurance",
  "/corporate",
  "/login",
  "/register",
];

function siteUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

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

  return [
    ...STATIC_ROUTES.map((path) => ({
      url: siteUrl(path),
      lastModified: now,
      changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : 0.8,
    })),
    ...launchCityRoutes,
    ...cityRoutes,
  ];
}
