# Swapl — Agent Guide

This file is the root-level onboarding guide for AI coding agents working on the Swapl monorepo. Swapl is a home-swap marketplace: homeowners trade keys for keys, with insurance, matching, and native mobile apps.

> **Important:** this repo has child `AGENTS.md` files that take precedence for their directories:
> - `app/AGENTS.md` — Next.js canary rules
> - `marketing/AGENTS.md` — Next.js canary rules
> - `ios/AGENTS.md` — SwiftUI / XcodeGen conventions
>
> Always read the relevant child `AGENTS.md` before editing files in those directories.

---

## 1. Project overview

Swapl is a full-stack marketplace shipped as a pnpm workspace monorepo. It contains:

| Surface | Path | Technology | Public domain |
|---------|------|------------|---------------|
| Product web app | `app/` | Next.js 16 (App Router), React 19, Prisma, Tailwind v4 | `app.swapl.fun` |
| Marketing / SEO site | `marketing/` | Next.js 16, mostly static | `swapl.fun` |
| iOS app | `ios/Swapl/` | SwiftUI, iOS 17+, URLSession + async/await | App Store (in prep) |
| Android app | `android/swapl/` | Kotlin + Jetpack Compose, minSdk 26 | Play Store (in prep) |
| Shared API contract | `packages/api-spec/` | OpenAPI 3.x | — |
| Generated Swift client | `packages/swapl-api-client/` | swift-openapi-generator | — |
| Design tokens | `packages/design-tokens/` | Style Dictionary → TS / Swift / Kotlin | — |

The backend is server-authoritative: web, iOS, and Android all call the same Next.js REST API in `app/`, which owns the single database.

Key docs:
- `docs/ARCHITECTURE.md` — deployment, auth, billing, crons, contracts
- `docs/DATABASE.md` — schema map, control queries, production sync notes
- `docs/STATO-DELL-ARTE-2026-06-11.md` — cross-platform launch readiness snapshot
- `security-pentest-findings.md`, `code-quality-bugs.md`, `architecture-review.md`, `MASTER-REPORT.md` — recent audit reports and fix log

---

## 2. Technology stack

- **Package manager:** `pnpm@10.18.3` only. One lockfile at the repo root.
- **Node:** 22 (enforced in CI via `.github/workflows/ci.yml`).
- **Web framework:** Next.js `16.3.0-canary.8` (App Router, Turbopack in dev, Webpack for Vercel builds).
- **UI:** React `19.2.4`, Tailwind CSS v4, `shadcn` v4, Radix UI primitives, `lucide-react`, `framer-motion`.
- **Fonts:** Fraunces (display), Inter (body), JetBrains Mono (mono) via `next/font/google`.
- **Database ORM:** Prisma `7.8.0`. Dev uses SQLite (`better-sqlite3`); production uses PostgreSQL (`pg` adapter).
- **Auth:** Custom HMAC-SHA256 signed cookie (`swapl_session`) for web; opaque SHA-256-hashed bearer tokens for mobile. `next-auth` is installed but **not** wired yet.
- **Validation:** Zod v4 everywhere on API boundaries.
- **Email:** React Email templates in `app/emails/`, sent via Resend when `RESEND_API_KEY` is set, otherwise console fallback.
- **Billing:** Stripe subscriptions + one-time purchases, idempotent webhooks.
- **Insurance:** Pluggable provider; defaults to `lib/insurance/mock.ts`.
- **Push:** Firebase Cloud Messaging for mobile, console fallback without credentials.
- **AI content:** Anthropic / OpenAI / Kimi / Moonshot via `lib/ai/client.ts`, template fallback when unconfigured.
- **Rate limiting:** Upstash Redis REST with in-memory fallback in `lib/rate-limit.ts`.
- **Cron:** Vercel cron `/api/cron/daily` dispatches feature-expiry, agreement-completion, reminders, saved-searches, etc.
- **i18n:** Web supports 16 locales under `app/lib/i18n/`; mobile has no localization infra yet.
- **Testing:** Vitest for the web app; native tests via `xcodebuild` and Gradle.

---

## 3. Repository layout

```
swapl/
├── app/                    # Product Next.js app
│   ├── app/                # App Router routes (pages + API)
│   ├── components/         # React components (ui, marketing, auth, admin, ...)
│   ├── emails/             # React Email templates
│   ├── lib/                # Business logic by domain (auth, billing, keys, ...)
│   ├── prisma/             # schema.prisma (SQLite dev), schema.postgres.prisma (prod), seed.ts
│   ├── public/             # Static assets, .well-known files
│   ├── scripts/            # One-off DB helpers
│   ├── test/               # Vitest test files (*.test.ts)
│   ├── generated/          # Prisma client, design tokens, API schema copy
│   ├── next.config.ts
│   ├── package.json
│   └── vitest.config.ts
├── marketing/              # Marketing Next.js site
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── next.config.ts
├── ios/Swapl/              # SwiftUI source tree
├── android/swapl/          # Kotlin / Compose source tree
├── packages/
│   ├── api-spec/           # openapi.yaml + drift-check script
│   ├── swapl-api-client/   # Swift package generated from openapi.yaml
│   ├── design-tokens/      # Source JSON → TS/Swift/Kotlin outputs
│   └── design-tokens-android/
├── docs/
├── package.json            # Root workspace manifest
└── pnpm-workspace.yaml
```

`app/lib/` is the main domain layer. Notable modules:
- `lib/auth/` — session, passwords, OTP, tokens, passkeys, OAuth, abilities
- `lib/billing/` — Stripe checkout, plan limits, reconciliation
- `lib/keys/` — virtual credit ledger, earn/gift/stay/valuation
- `lib/insurance/` — provider adapter, mock, access, on-chain anchoring (TON)
- `lib/listing/` — availability, occupancy, calendar, query, filters
- `lib/conversation/`, `lib/trip/`, `lib/growth/` — messaging, trip lifecycle, referrals
- `lib/ai/` — content generation, suggestions, valuation
- `lib/api/errors.ts` — standardized JSON error helpers
- `lib/db/` — Prisma singleton proxy + JSON TEXT helpers
- `lib/validators.ts` — Zod schemas

---

## 4. Build, dev, and test commands

All commands assume you are at the repo root unless noted.

### Install

```bash
pnpm install
```

The `app` package has a `postinstall` script that runs `prisma generate` against the SQLite schema locally and against `prisma/schema.postgres.prisma` when `VERCEL` is set.

### Root shortcuts

```bash
pnpm run dev:web         # app on http://localhost:3000
pnpm run dev:marketing   # marketing on http://localhost:3001
pnpm run build:web       # production build of app
pnpm run build:marketing # production build of marketing
pnpm run test            # web app test suite (vitest)
pnpm run typecheck       # web app typecheck
```

### App-specific commands (`cd app/` or `pnpm --filter app`)

```bash
pnpm dev                          # next dev
pnpm build                        # next build
pnpm typecheck                    # next typegen && tsc --noEmit
pnpm test                         # vitest run
pnpm test:watch                   # vitest
pnpm lint                         # eslint (currently has a backlog; CI allows it to fail)

# Database (dev, SQLite)
pnpm db:migrate                   # prisma migrate dev
pnpm db:generate                  # prisma generate
pnpm db:seed                      # tsx prisma/seed.ts (demo accounts + listings)
pnpm db:reset                     # migrate reset --force + seed

# Production schema helpers
pnpm check:prod-schema            # detect drift between SQLite and Postgres schemas
pnpm db:sync-prod                 # sync prod schema
pnpm vercel-build                 # full Vercel build command
```

### Marketing-specific commands

```bash
pnpm --filter marketing dev       # :3001
pnpm --filter marketing build
pnpm --filter marketing typecheck
pnpm --filter marketing lint
```

### Shared packages

```bash
# API spec
pnpm --filter @swapl/api-spec gen:ts          # emit generated/ts/schema.d.ts and copy to app/lib/generated/
pnpm --filter @swapl/api-spec gen:swift-spec  # copy openapi.yaml to swapl-api-client
pnpm --filter @swapl/api-spec check:drift     # CI gate: every backend route must be in openapi.yaml

# Design tokens
pnpm --filter @swapl/design-tokens build      # rebuild build/ts, build/swift, build/kotlin
```

### Native apps

iOS (from `ios/`):

```bash
xcodegen generate                 # regenerate Swapl.xcodeproj from project.yml
xcodebuild test -scheme Swapl -destination 'platform=iOS Simulator,name=iPhone 16'
```

Android (from `android/swapl/`):

```bash
gradle wrapper --gradle-version 8.7   # one-time if wrapper missing
./gradlew assembleDebug
./gradlew test
```

---

## 5. Environment variables

Copy `app/.env.example` to `app/.env.local` for local development.

Required minimum to boot locally:

```dotenv
DATABASE_URL="file:./dev.db"
SESSION_SECRET="<32+ random bytes>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Critical production variables (set in Vercel, never commit):

```dotenv
DATABASE_URL=postgresql://...
SESSION_SECRET=<strong random>
NEXT_PUBLIC_APP_URL=https://app.swapl.fun
CRON_SECRET=<random>
RESEND_API_KEY=...
RESEND_FROM="swapl <hello@swapl.fun>"
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
TURNSTILE_SECRET_KEY=...
FCM_SERVICE_ACCOUNT_JSON=...
SENTRY_DSN=...
```

The app degrades gracefully when integrations are missing:
- No Stripe → billing endpoints return 503
- No Resend → emails log to console
- No FCM → push logs to console
- No AI key → AI features use templates
- No Turnstile → captcha skipped

---

## 6. Code organization and conventions

### Monorepo rules

- **Use pnpm only.** Never run `npm install` inside a workspace package.
- Use the root lockfile (`pnpm-lock.yaml`).
- Commit messages are path-scoped when possible: `feat(web): ...`, `ios: ...`, `android: ...`, `marketing: ...`.

### Next.js / web conventions

- App Router is used throughout (`app/app/`). Route handlers live next to pages.
- Server Components by default; add `"use client"` only when needed.
- Path alias `@/` maps to the package root (`app/tsconfig.json`).
- Use `lib/api/errors.ts` helpers (`apiError`, `unauthenticated`, `forbidden`, `rateLimited`, etc.) for API responses.
- Validate every API input with Zod (`lib/validators.ts`).
- Use `getSessionFromRequest(req)` for routes that mobile clients call; use `getSession()` only for cookie-only web flows.
- Business logic should live in `lib/` modules, not route handlers. Route handlers should parse, authorize, call `lib/`, and respond.
- JSON-encoded TEXT columns are used because SQLite lacks arrays/objects; use `parseJSON` / `stringifyJSON` from `lib/db`.

### Native app conventions

- iOS and Android never touch the database directly; they call the product API.
- iOS uses `@Observable` state and `URLSession` + async/await.
- Android uses Compose + Material 3, Ktor + Hilt.
- Both consume generated design tokens from `packages/design-tokens/build/`.

### Design tokens

- Source of truth is `packages/design-tokens/tokens/**/*.json`.
- Run `pnpm --filter @swapl/design-tokens build` after editing tokens and commit the generated outputs.
- CI should fail if generated outputs drift from source.

### API contract

- `packages/api-spec/openapi.yaml` is the declared source of truth.
- Update the spec **before** changing an endpoint shape.
- The web app currently uses hand-written fetch, not the generated TS client, but the spec is enforced by a drift-check script in CI.

---

## 7. Authentication and authorization

- **Web session:** HMAC-SHA256 signed cookie `swapl_session`, 30 days. Fails closed in production if `SESSION_SECRET` is missing or < 32 chars.
- **Mobile session:** `Authorization: Bearer <token>` header. Raw token returned once, SHA-256 hash stored in `AuthToken`. 30-day sliding window; `revokedAt` for revocation.
- **Roles:** `User.role` is `member` or `swapl_admin`. Admin routes use `requireAdmin` / `requireAdminFromRequest`.
- **Suspended accounts:** checked at route level because cookie sessions are stateless.
- **OAuth:** Google, Apple, Telegram endpoints are env-gated; return 503 when unconfigured.
- **Passkeys:** WebAuthn supported, but currently sets `requireUserVerification: false`.

---

## 8. Database

- Two identical Prisma schemas:
  - `app/prisma/schema.prisma` — SQLite (dev)
  - `app/prisma/schema.postgres.prisma` — PostgreSQL (prod)
- **Every model change must be applied to both files.**
- Production uses `prisma db push` (no migration files); only additive changes are allowed by policy.
- `app/lib/db/prisma.ts` uses a lazy Proxy so importing the module does not instantiate a client at build time.
- Postgres-specific exclusion constraints for availability are applied via `scripts/apply-postgres-availability-constraints.ts`.

Key models: `User`, `Listing`, `SwapProposal`, `SwapAgreement`, `InsurancePolicy`, `BetaSignup`, `Report`, `Subscription`, `Plan`, `KeysTransaction`, `AuthToken`, `EmailToken`, `Device`, `BillingEvent`.

---

## 9. Testing strategy

### Web tests

- Framework: Vitest, Node environment.
- Location: `app/test/**/*.test.ts` (88+ files).
- Config: `app/vitest.config.ts` mirrors the `@/` alias and sets `ALLOW_INSECURE_CRON=1` so cron logic tests can run without a bearer secret.
- Run: `pnpm --filter app test`.
- Tests cover auth, proposals, billing reconciliation, keys ledger, cron jobs, admin, i18n coverage, validators, and more.

### CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:
1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @swapl/api-spec check:drift`
3. `pnpm --filter app typecheck`
4. `pnpm --filter app test`
5. `pnpm --filter marketing typecheck`
6. `pnpm --filter app lint` (non-blocking until backlog is cleared)

### Native tests

- iOS: `xcodebuild test -scheme Swapl -destination 'platform=iOS Simulator,name=iPhone 16'`
- Android: `./gradlew test` / `./gradlew assembleDebug`

---

## 10. Deployment

Two Vercel projects share this repo, separated by Root Directory:

| Vercel project | Root Directory | Domain | Notes |
|----------------|----------------|--------|-------|
| `swapl` | `app` | `app.swapl.fun` | Postgres, crons, serverless functions |
| `swapl-marketing` | `marketing` | `swapl.fun` | Static-first, proxies `/api/*` to product app |

- Both use `installCommand: pnpm install --frozen-lockfile`.
- `app/vercel.json` uses `buildCommand` that clears `.next`, generates the Postgres Prisma client, and runs `next build --webpack`.
- `app/vercel.json` defines a daily cron at `0 7 * * *` hitting `/api/cron/daily`.
- `marketing/vercel.json` proxies `/api/*` to `NEXT_PUBLIC_APP_URL` and redirects product paths to the app domain.
- `ignoreCommand` path-filters prevent deploys when only unrelated surfaces changed.

---

## 11. Security considerations

The project went through a security audit on 2026-06-19. Many critical and high issues were fixed (see `FIX-LOG.md` and `MASTER-REPORT.md`). Remaining risks agents should be aware of:

### Already fixed (do not reintroduce)

- Atomic token/OTP consumption with `updateMany` guards on `usedAt: null` / `consumedAt: null`.
- Durable rate limiting on mobile login (`/api/auth/token`), forgot-password, and OAuth routes.
- `crypto.randomInt()` for swap key codes and policy numbers.
- Billing routes now use `getSessionFromRequest()` so mobile users can subscribe.
- CSV export sanitizes formula-triggering characters.
- Keys ledger uses atomic `increment` to prevent lost-update overdrafts.
- Gift/referral/proposal cap checks moved inside transactions.

### Still open / known weaknesses

- **Sensitive DB fields are plaintext:** `SwapAgreement.keyCode1/2`, `ListingHomeGuide.wifiPassword`, `User.aiApiKey`. Application-level encryption is recommended.
- **Stateless web cookies cannot be revoked per-session** without rotating the global `SESSION_SECRET`. Consider adding `sessionVersion` / `passwordChangedAt` checks or moving to a stateful store.
- **CSP is minimal:** only `frame-ancestors 'none'` is set. A stricter nonce-based CSP is recommended.
- **Session cookie lacks `__Host-` prefix and `Partitioned` attribute.**
- **Passkeys use `requireUserVerification: false`**, weakening MFA posture.
- **Email verification is still a GET endpoint** (rate-limited now, but prefetchers may still consume tokens). A two-step POST flow is recommended.
- **User enumeration via registration:** the register route returns `409 "Email already in use"`.
- **Dev fallback secret:** `DEV_FALLBACK_SECRET` exists for local dev but is warned against; production fails closed.
- **Turnstile verification** does not assert `hostname` or `action`.
- **OAuth / email bodies may be logged to console** when credentials are missing.
- **In-memory rate-limit map** is pruned but still a best-effort fallback; production should use Upstash.

### Secure coding checklist for agents

- Use `getSessionFromRequest(req)` for any route mobile clients may call.
- Rate-limit auth and mutating endpoints with `checkRateLimitDurable`, not `checkRateLimit`, in production paths.
- Never use `Math.random()` for security codes or IDs; use `crypto.randomInt()` / `crypto.randomBytes()`.
- Wrap read-check-write financial or quota logic in a single transaction or atomic update.
- Do not return different error messages that reveal account existence.
- Keep `SESSION_SECRET`, `CRON_SECRET`, and Stripe webhook secrets out of source control.

---

## 12. Known architecture risks and debt

From `architecture-review.md` and `docs/STATO-DELL-ARTE-2026-06-11.md`:

- **No formal Postgres migration pipeline.** Production changes rely on `prisma db push`. Destructive changes must be handled manually.
- **Dual-schema maintenance burden.** Both `schema.prisma` and `schema.postgres.prisma` must be kept identical.
- **Stringly-typed enums** in Prisma (SQLite limitation), pushing enum safety to the application layer.
- **JSON stored as TEXT** for arrays/objects; malformed JSON silently falls back via `parseJSON`.
- **No API versioning.** Breaking changes require client coordination.
- **OpenAPI spec drift.** The backend has more routes than the spec documents; the drift-check CI gate is the guardrail.
- **No connection pooling configuration** documented for production Postgres.
- **No mobile i18n, offline support, or formal analytics/event tracking** yet.
- **Custom auth is explicitly a demo.** Migration to NextAuth / iron-session is planned before launch.

---

## 13. Quick start for agents

1. `pnpm install`
2. `cp app/.env.example app/.env.local` and set `SESSION_SECRET`.
3. `pnpm --filter app db:migrate`
4. `pnpm --filter app db:seed`
5. `pnpm run dev:web`
6. Open `http://localhost:3000` and sign in with a seed account (e.g. `asli@demo.swapl` / `swapl-demo`).

When you start work:
- Read the child `AGENTS.md` for the surface you are editing.
- Run `pnpm --filter app typecheck` and `pnpm --filter app test` before committing.
- If you change the API, update `packages/api-spec/openapi.yaml` first and run `pnpm --filter @swapl/api-spec check:drift`.
- If you change design tokens, rebuild and commit generated outputs.
