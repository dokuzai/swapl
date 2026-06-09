import { OG_SIZE, OG_CONTENT_TYPE, renderOgImage } from "@/lib/marketing/og";
import { getCityLaunchPage } from "@/lib/marketing/city-launch";

export const alt = "swapl city launch";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  const page = getCityLaunchPage(citySlug);

  return renderOgImage({
    kicker: page ? `${page.country} · launch city` : "Launch city",
    title: page ? `Home swaps in ${page.city}.` : "Home swaps, city by city.",
    subtitle: page
      ? `List your ${page.city} home before September to become a founding host. ${page.angle}`
      : "List before September 2026 to become a founding host.",
  });
}
