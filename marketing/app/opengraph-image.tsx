import { OG_SIZE, OG_CONTENT_TYPE, renderOgImage } from "@/lib/marketing/og";

export const alt = "swapl — home swapping for September 2026";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    kicker: "Home swapping",
    title: "Trade keys for keys.",
    subtitle: "No money ever changes hands, and every swap is backed by the Swapl Guarantee. Home swapping, launching September 2026.",
  });
}
