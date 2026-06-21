import { OG_SIZE, OG_CONTENT_TYPE, renderOgImage } from "@/lib/marketing/og";
import { getCorridor } from "@/lib/marketing/corridors";

export const alt = "swapl home swap corridor";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ corridor: string }> }) {
  const { corridor } = await params;
  const c = getCorridor(corridor);

  return renderOgImage({
    kicker: c ? `${c.from.city} → ${c.to.city}` : "Home swap corridor",
    title: c ? `${c.from.city} → ${c.to.city}` : "Trade keys for keys.",
    subtitle: c
      ? `Swap your ${c.from.city} home for a place in ${c.to.city}. No money, backed by the Swapl Guarantee.`
      : "Money-free home swaps, backed by the Swapl Guarantee. Launching September 2026.",
  });
}
