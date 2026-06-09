# swapl marketing site

Standalone Next.js app serving the presentation/SEO site on **https://swapl.fun** (home, pricing, corporate, city launch pages, corridors, blog, guides, how-it-works, insurance, contact, legal). The product web app lives separately at **https://app.swapl.fun** (`app/` in this monorepo).

No database, auth, Stripe, or other server-only dependencies. Forms and trackers POST to relative `/api/*` paths, which `next.config.ts` rewrites (proxies) to the product app — except `/api/i18n/locale`, which is served locally.

## Develop

```sh
pnpm install                      # at the repo root
pnpm --filter marketing dev       # http://localhost:3001
pnpm --filter marketing build
pnpm --filter marketing typecheck
pnpm --filter marketing lint
```

## Environment variables

All optional (sane production defaults baked in):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://app.swapl.fun` | Product app origin — used by `lib/app-url.ts` for cross-app links (login, register, listings, ...) and by the `/api/*` rewrite proxy. |
| `NEXT_PUBLIC_SITE_URL` | `https://swapl.fun` | Canonical base URL of this site — metadata, sitemap, robots, structured data. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | unset (captcha off) | Cloudflare Turnstile site key for the waitlist form. |

## Vercel project setup

- Root Directory: `marketing` (framework preset: Next.js)
- Domain: `swapl.fun`
- Install/build/ignore commands come from `marketing/vercel.json` (skips deploys when neither `marketing/` nor `pnpm-lock.yaml` changed).
