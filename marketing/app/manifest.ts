import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "swapl — home swapping",
    short_name: "swapl",
    description:
      "Trade your home for someone else's. A home-swap marketplace — keys for keys, no nightly rates, every accepted stay insured.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF6E8",
    theme_color: "#F24B8E",
    icons: [
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
