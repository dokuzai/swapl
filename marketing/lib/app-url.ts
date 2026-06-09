// Absolute URLs into the product web app (app.swapl.fun). The marketing site
// lives on swapl.fun, so every link that crosses into the product (login,
// register, dashboard, listings browse, ...) must be absolute. Marketing-
// internal links (blog, pricing, guides, ...) stay relative.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.swapl.fun").replace(/\/$/, "");

export function appUrl(path: string): string {
  return `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Canonical base URL of the marketing site itself (swapl.fun). Used by
// sitemap/robots/structured data/metadata.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://swapl.fun").replace(/\/$/, "");

export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
