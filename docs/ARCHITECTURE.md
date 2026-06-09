# Swapl — Architecture & Infrastructure

Swapl is a home-swap marketplace. This monorepo contains every surface of the product plus the shared contracts that keep them in sync.

## Repository layout

```
swapl/
├── app/          Product web app (Next.js 15, App Router) — app.swapl.fun
├── marketing/    Marketing / presentation site (Next.js, mostly static) — swapl.fun
├── ios/          Native iOS app (SwiftUI, iOS 17+, XcodeGen project.yml)
├── android/      Native Android app (Kotlin)
├── packages/
│   ├── api-spec/              OpenAPI contract — single source of truth for client types
│   ├── swapl-api-client/      Generated TS client for the API
│   ├── design-tokens/         Colors/typography/spacing → TS (web), Swift (iOS)
│   └── design-tokens-android/ Kotlin token emission
├── docs/         This file + marketing playbooks (docs/marketing/)
├── package.json  Workspace root (private, pnpm scripts)
└── pnpm-workspace.yaml
```

**Package manager: pnpm only.** One lockfile at the repo root (`pnpm-lock.yaml`). Never run `npm install` inside a workspace package. Common commands from the root:

```bash
pnpm install                # whole workspace
pnpm run dev:web            # product app on :3000
pnpm run dev:marketing      # marketing site on :3001
pnpm run test               # web app vitest suite
pnpm run typecheck          # web app typecheck
```

## Deployment (Vercel)

Two Vercel projects on the same GitHub repo, separated by Root Directory:

| Project | Root Directory | Domain | Notes |
|---|---|---|---|
| `swapl` | `app` | app.swapl.fun (currently swapl.fun) | Postgres via Prisma, crons |
| `swapl-marketing` | `marketing` | swapl.fun | Static-first, proxies `/api/*` to the app |

Each app carries its own `vercel.json` (inside its directory, where Vercel reads it):
- `installCommand: pnpm install --frozen-lockfile` — pnpm resolves the workspace root automatically.
- `ignoreCommand` — path-filtered builds: a commit touching only `ios/` or `android/` does **not** trigger a web deploy; a commit touching only `marketing/` does not redeploy the product app, and vice versa.
- Crons live in `app/vercel.json` (`featured-expire`, `saved-searches`, plus agreement lifecycle crons).

### Domain cutover plan (swapl.fun → marketing)

1. Create the `swapl-marketing` Vercel project (root directory `marketing`).
2. Set `NEXT_PUBLIC_APP_URL=https://app.swapl.fun` on the marketing project.
3. Add `app.swapl.fun` to the `swapl` project and set its `NEXT_PUBLIC_APP_URL` accordingly.
4. Move `swapl.fun` to the marketing project. Marketing rewrites `/api/*` to the app, so the waitlist form keeps working.
5. Add redirects on the marketing project for product paths (`/login`, `/register`, `/dashboard`, `/listings`, `/swaps`) → `https://app.swapl.fun/...` so old links keep working.
6. After cutover, delete the duplicated marketing pages from `app/`.

## Backend (app/) — how it works

Custom lightweight stack, no framework magic:

- **Database** — Prisma. Two identical schemas: `prisma/schema.prisma` (SQLite, local dev) and `prisma/schema.postgres.prisma` (Postgres, production; selected automatically when `VERCEL` is set). Any model change must be applied to **both** files.
- **Auth** — custom, not Auth.js. Web: HMAC-SHA256 signed cookie (`swapl_session`, 30 days). Mobile (iOS/Android): opaque bearer tokens, SHA-256-hashed in the `AuthToken` table, 30-day sliding window. Email+password only (bcrypt); OAuth not implemented yet.
- **Email verification** — one-shot SHA-256 tokens (7-day expiry). Publishing a listing and sending proposals require a verified email.
- **Listings** — full CRUD with plan limits, amenity filters, geocoding (city coords + jitter), AI-generated city art (cached in `CityArt`). Photos upload to **UploadThing** CDN.
- **Swaps** — `SwapProposal` (PENDING → ACCEPTED/DECLINED/COUNTERED/WITHDRAWN) with counter-offers; on accept a `SwapAgreement` is created in a transaction with two 4-digit key codes and an auto-issued `InsurancePolicy` (mock provider by default, swappable via `INSURANCE_PROVIDER`).
- **Billing** — Stripe. Subscriptions (Free/Plus/Pro) fully wired with idempotent webhooks (`BillingEvent.stripeId`). One-time purchases (listing verification €39, featured placement, add-ons) are partially stubbed; listing verification has a pre-launch mode that skips payment and goes straight to the admin review queue.
- **Emails** — react-email templates (`emails/`), sent via Resend; falls back to console logging when `RESEND_API_KEY` is unset.
- **Push** — FCM for iOS/Android device tokens; console fallback without credentials.
- **Rate limiting** — Upstash (or in-memory fallback): signup 10/h/IP, login 30/5min/IP, proposals 10/day/user. Turnstile captcha on signup.
- **Crons** — `/api/cron/*` guarded by `CRON_SECRET` bearer header, scheduled in `app/vercel.json`.
- **Admin** — `User.role = "swapl_admin"`; verification review queue + operations dashboards under `/admin`.

### Environment variables (production minimum)

```
DATABASE_URL=postgresql://...
SESSION_SECRET=<32+ random bytes>
NEXT_PUBLIC_APP_URL=https://app.swapl.fun
CRON_SECRET=<random>
RESEND_API_KEY=re_...            # otherwise emails only log to console
RESEND_FROM="swapl <hello@swapl.fun>"
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_*   # billing (503 without)
TURNSTILE_SECRET_KEY             # captcha on signup (no-op without)
FCM_SERVICE_ACCOUNT_JSON         # push (console fallback without)
ANTHROPIC_API_KEY                # AI content (template fallback without)
```

Everything degrades gracefully: missing Stripe → paid features answer 503; missing email/push/AI keys → console/template fallbacks.

## Shared contracts

- `packages/api-spec` — OpenAPI definition; web/iOS/Android types are generated from it. Change the API here first.
- `packages/design-tokens` — tokens emitted to TS/Swift/Kotlin; native apps consume the generated artifacts (see `ios/README.md`).

## Conventions

- Path-scoped commits: prefix with the surface (`feat(web): …`, `android: …`, `ios: …`, `marketing: …`).
- Native apps never reach the DB — they speak to `app/`'s API with bearer tokens.
- Work planning lives in Linear (project "Swapl launch").
