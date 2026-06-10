// The marketing surface (home, pricing, blog, guides, legal pages) lives on
// the standalone marketing site. Product code links there via this helper so
// the destination stays configurable per environment.
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://swapl.fun";

export function marketingUrl(path: string = "/"): string {
  return new URL(path, MARKETING_URL).toString();
}
