# Swapl repository instructions

## Build, test, lint, and related commands

Use **pnpm from the repository root**. This repo has a single `pnpm-lock.yaml`; do not run `npm install` inside workspace packages.

```bash
pnpm install

# Dev
pnpm run dev:web              # app/ on :3000
pnpm run dev:marketing        # marketing/ on :3001

# Builds
pnpm run build:web
pnpm run build:marketing

# Typecheck / lint
pnpm run typecheck            # app/
pnpm --filter marketing typecheck
pnpm --filter app lint
pnpm --filter marketing lint

# Tests
pnpm run test                 # app/ vitest suite
pnpm --filter app test -- test/api-errors.test.ts
pnpm --filter app test -- test/api-errors.test.ts -t "unauthenticated -> 401 UNAUTHENTICATED"

# API contract + generated artifacts
pnpm --filter @swapl/api-spec check:drift
pnpm --filter @swapl/api-spec generate
pnpm --filter @swapl/design-tokens build

# App database (local dev)
pnpm --filter app db:migrate
pnpm --filter app db:seed
```

## High-level architecture

This is a **pnpm monorepo** with two separate Next.js surfaces:

- `app/`: the product app and the backend API. It owns auth, Prisma, billing, email, cron routes, and every JSON API consumed by web and native clients.
- `marketing/`: a separate mostly static marketing site. It does **not** own backend business logic; most `/api/*` requests are rewritten to `app/`, while product routes such as `/login` and `/dashboard` are redirected to the app domain.

Shared packages keep the surfaces and native clients aligned:

- `packages/api-spec`: the OpenAPI contract and the **source of truth** for public client-facing API routes.
- `packages/design-tokens`: design tokens emitted to web, iOS, and Android artifacts.
- `packages/swapl-api-client`: Swift package generated from the shared OpenAPI spec for iOS.

Persistence and auth span multiple files:

- Local development uses **SQLite** (`app/prisma/schema.prisma`); production uses a mirrored **Postgres** schema (`app/prisma/schema.postgres.prisma`). Keep both Prisma schema files in sync.
- Because SQLite lacks arrays/enums in the same way Postgres supports them, several Prisma `String` fields store JSON; app code normalizes them through `app/lib/db/index.ts`.
- Web auth uses a signed cookie; mobile clients use opaque bearer tokens hashed in the `AuthToken` table. API routes that should work for both must read auth through `getSessionFromRequest()` / `requireSessionFromRequest()`.

## Key conventions

- This repo is on **Next.js 16 canary / React 19**. Do not assume older Next.js behavior; read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code.
- For **public API changes**, update `packages/api-spec/openapi.yaml` first, then run `pnpm --filter @swapl/api-spec generate`. CI enforces drift with `pnpm --filter @swapl/api-spec check:drift`.
- The web app intentionally keeps a generated copy of the API types in `app/lib/generated/api-schema.d.ts` so `app/` can build in isolation on Vercel. If the OpenAPI spec changes, regenerate that copy rather than editing it manually.
- In `app/app/api/**`, the common pattern is: parse request JSON, validate with Zod, and return stable JSON error shapes. Reuse shared helpers from `app/lib/api/errors.ts` where possible because web/iOS/Android clients depend on those response bodies.
- For fields backed by JSON-in-`String` columns, reuse `parseJSON()` / `stringifyJSON()` instead of ad hoc `JSON.parse` / `JSON.stringify`.
- If you change `packages/design-tokens/tokens/**`, rebuild the generated outputs with `pnpm --filter @swapl/design-tokens build` and commit the emitted artifacts too.
- Marketing-to-app links should use `marketing/lib/app-url.ts` so cross-domain links stay absolute and environment-aware.
- Marketing i18n is dictionary-based: English is the source of truth, other locale dictionaries mirror its keys and are merged over English at runtime.
