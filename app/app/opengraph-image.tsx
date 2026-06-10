import { OG_SIZE, OG_CONTENT_TYPE, renderOgImage } from "@/lib/marketing/og";

export const alt = "swapl — browse homes and manage your swaps";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    kicker: "Home swapping",
    title: "Trade keys for keys.",
    subtitle: "Browse member homes, propose swaps and manage every stay in one place. No money ever changes hands, and every accepted stay is insured.",
  });
}
