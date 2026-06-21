# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use **pnpm from the repository root**. Never `npm install` inside workspace packages.

```bash
pnpm install

# Dev
pnpm run dev:web              # app/ on :3000
pnpm run dev:marketing        # marketing/ on :3001

# Build
pnpm run build:web
pnpm run build:marketing

# Typecheck / lint
pnpm run typecheck            # app/
pnpm --filter marketing typecheck
pnpm --filter app lint
pnpm --filter marketing lint

# Tests (Vitest, node env)
pnpm run test                 # full app/ suite
pnpm --filter app test -- test/<file>.test.ts
pnpm --filter app test -- test/<file>.test.ts -t "<test name>"

# Database (local SQLite)
pnpm --filter app db:migrate
pnpm --filter app db:seed

# API spec & generated types
pnpm --filter @swapl/api-spec check:drift
pnpm --filter @swapl/api-spec generate

# Design tokens
pnpm --filter @swapl/design-tokens build
```

## Architecture

**pnpm monorepo** (`pnpm-workspace.yaml`): `app/`, `marketing/`, `packages/*`.

- **`app/`** — Next.js 16 canary (App Router) + React 19. Product web app *and* all backend API routes. Owns auth, Prisma, billing, email, cron, and every JSON API consumed by web, iOS, and Android.
- **`marketing/`** — Separate static Next.js marketing site. No backend logic; product routes redirect to app domain, some `/api/*` requests proxy to app.
- **`packages/api-spec`** — OpenAPI spec (`openapi.yaml`), source of truth for public APIs. Generates `app/lib/generated/api-schema.d.ts` and a Swift client.
- **`packages/design-tokens`** — Tokens emitted to TS, Swift, and Kotlin.
- **`ios/`** — SwiftUI native app (XcodeGen). **`android/`** — Kotlin native app.

### Database (dual Prisma schema)

Two schema files must always stay in sync:
- `app/prisma/schema.prisma` — SQLite (local dev)
- `app/prisma/schema.postgres.prisma` — PostgreSQL (prod, Neon)

SQLite lacks arrays/enums, so several fields store JSON as `String`. Always use `parseJSON()` / `stringifyJSON()` from `app/lib/db/index.ts`, never raw `JSON.parse`/`JSON.stringify`. Restart the dev server after Prisma schema changes.

### Auth

- Web: signed cookie (`swapl_session`) via `getSessionFromRequest(req)`
- Mobile: `Authorization: Bearer <token>` (hashed in `AuthToken` table), same function
- Admin: `User.role === "swapl_admin"`
- API routes serving both web and mobile must use `getSessionFromRequest()` / `requireSessionFromRequest()`

### API routes

Pattern: parse JSON → validate with Zod → return stable JSON error shapes (via `app/lib/api/errors.ts`). These response bodies are a contract with iOS/Android — do not change shapes without updating the OpenAPI spec first.

### i18n

- 16 locales + 1 variant. Source of truth: `app/lib/i18n/dict-en.ts` — new keys go here first.
- Runtime merges each locale over English; missing keys fall back silently.
- `test/i18n-coverage.test.ts` enforces all 16 locales have all keys.
- RTL locales: `ar`, `fa`, `ar-PS`.

### Path alias

`@/*` resolves to `app/` root (in both tsconfig and vitest).

## Key Conventions

- **Next.js 16 canary** has breaking changes. Read `node_modules/next/dist/docs/` before touching framework-level code.
- **Public API changes**: update `packages/api-spec/openapi.yaml` first, regenerate, then implement. CI enforces drift.
- **JSON-in-String fields**: use `parseJSON()`/`stringifyJSON()`, not raw JSON methods.
- **Marketing → app links**: use `marketing/lib/app-url.ts` for cross-domain links.
- **Design token changes**: rebuild with `pnpm --filter @swapl/design-tokens build` and commit generated artifacts.
- **Deploy**: via git push, not `vercel --prod` from `app/`.
- **Prod DB**: Neon vars use `sw_` prefix; run prod scripts with postgres client + `sw_DATABASE_URL_UNPOOLED`.
