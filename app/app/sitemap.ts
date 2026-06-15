import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";

const STATIC_ROUTES = ["", "/listings", "/login", "/register"];

function siteUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: siteUrl(path),
    lastModified: now,
    changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
    priority: path === "" ? 1 : 0.8,
  }));

  // Active listings — except those of users who opted out of search-engine
  // indexing (settings.searchEngineIndexing=false; their pages also carry
  // robots noindex, see app/listings/[id]/page.tsx).
  const listings = await prisma.listing.findMany({
    where: { isActive: true, ineligibleReason: null },
    select: { id: true, updatedAt: true, user: { select: { settings: true } } },
    orderBy: { createdAt: "desc" },
  });

  const listingEntries: MetadataRoute.Sitemap = listings
    .filter((l) => parseSettings(l.user.settings).searchEngineIndexing)
    .map((l) => ({
      url: siteUrl(`/listings/${l.id}`),
      lastModified: l.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [...staticEntries, ...listingEntries];
}
