# Architecture Review — Swapl

> Review date: 2026-06-19  
> Project: Swapl (home-swap marketplace)  
> Scope: Next.js 15 App Router monorepo (`app/`), shared packages, iOS/Android shells

---

## Executive Summary

- **Overall architecture grade: B+**
- **Strengths:** Clean domain-layer separation, strong type safety, graceful degradation, excellent test coverage, pragmatic dual-database strategy, well-documented schema
- **Weaknesses:** Production schema drift risk, custom auth still in "demo" mode, no formal migration pipeline, some N+1 query patterns, canary Next.js runtime
- **Technical debt hotspots:** dual-schema maintenance, `prisma db push` to production, stringly-typed enums, missing caching layer, unversioned API

---

## Architecture Dimensions

### 1. Code Organization & Layering

**What’s done well:**
- The `lib/` directory is organized by domain (`billing/`, `keys/`, `insurance/`, `growth/`, `conversation/`, `listing/`), which approximates a feature-driven structure rather than a strict layered architecture. This works well for a small team.
- Domain logic is extracted from route handlers into `lib/` modules. For example, `lib/keys/ledger.ts` contains the entire append-only ledger primitive, and `lib/insurance/provider.ts` defines an adapter interface with a mock implementation.
- The `app/app/api/` routes are thin orchestrators: they parse the request, call `lib/` helpers, and return JSON. This is a good pattern.
- Shared packages (`api-spec/`, `swapl-api-client/`, `design-tokens/`) are properly scoped and consumed by the web and mobile surfaces.
- Path alias `@/` is consistently used, and `vitest.config.ts` mirrors the `tsconfig.json` alias so tests import the same way as production code.

**Concerns:**
- There is no strict **anti-corruption layer** or **hexagonal port/adapter** boundary. The `lib/` modules import Prisma directly and return Prisma-shaped objects, so the domain layer is tightly coupled to the ORM.
- No **service layer** abstraction. Business logic often sits in both `lib/` modules and route handlers, making it hard to know where a rule lives. Example: plan-limit enforcement is in `lib/billing/limits.ts`, but proposal creation also embeds rate-limiting and suspension checks inline in `app/app/api/proposals/route.ts`.
- The `lib/api/` directory only contains `errors.ts`; a more robust API layer would include request validation, serialization, and OpenAPI contract enforcement.
- **Monorepo boundary risk:** `app/` imports `../../generated/prisma` with a relative path, bypassing the workspace package system. This creates a hidden coupling between the build output and the source tree.

### 2. API Design & Contracts

**What’s done well:**
- Error responses are standardized in `lib/api/errors.ts` with consistent HTTP status codes and machine-readable error strings (`UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `ACCOUNT_SUSPENDED`).
- The API is designed with mobile-first considerations: bearer tokens for iOS/Android, cookies for web, unified via `getSessionFromRequest()`.
- Route handlers are co-located with the App Router convention (`app/api/[domain]/route.ts`).
- Idempotency is handled carefully in billing webhooks (`BillingEvent.stripeId` uniqueness) and the Keys ledger (`eventKey` partial unique).

**Concerns:**
- **No API versioning.** The URL structure is flat (`/api/proposals`, `/api/keys`). When breaking changes are needed, there is no migration path other than breaking existing clients.
- **OpenAPI contract is not enforced.** `packages/api-spec/` exists, but the route handlers do not validate outgoing shapes against it. There is no generated server-side validation from the spec. The web app and native clients rely on the spec, but the backend is the source of truth by convention only.
- **No request/response DTOs.** Route handlers return raw Prisma objects or manually assembled objects. This means accidental field leaks (e.g., internal IDs, PII) are possible if a developer forgets to `select` only public fields.
- Some routes mix business logic with presentation logic. Example: `app/app/api/proposals/route.ts` (lines 14–91) buckets proposals into `waitingOnYou`, `sent`, `active`, `archived` — this is a UI concern that should probably live in a BFF or client-side adapter.

### 3. Database Architecture

**What’s done well:**
- The dual-schema strategy (`schema.prisma` for SQLite dev, `schema.postgres.prisma` for PostgreSQL prod) is remarkably well executed. The `prisma.ts` client uses a lazy Proxy pattern to avoid instantiating a DB connection at build time, and the `postinstall` script selects the correct schema based on `VERCEL` env.
- The schema is extensively documented with inline comments explaining every field and business rule.
- Smart use of composite indexes and unique constraints (`@@unique([proposalId, userId])` on `ConversationRead`, `@@unique([source, sourceId, listingId])` on `ListingOccupancy`).
- The **Keys credit ledger** (`KeysTransaction`) is properly append-only, with a cached `User.keysBalance` updated inside the same transaction. This is a solid accounting pattern.
- `ListingOccupancy` acts as an authoritative ledger for availability, preventing double-booking at the DB level (with a Postgres exclusion constraint applied via `scripts/apply-postgres-availability-constraints.ts`).

**Critical concerns:**
- **No formal migration pipeline for production.** `docs/DATABASE.md` explicitly states: "there are no Postgres migration files — after changing both schema files, sync prod with `prisma db push`". This is dangerous for a production marketplace. `db push` is additive-only by policy, but there is no enforcement, and accidental destructive changes are possible. **This is a P0 risk.**
- **Dual-schema maintenance burden.** Every model change must be applied to both files manually. The CI has `check:prod-schema` and `db:sync-prod`, but there is no automated diff check that fails a PR if the two schemas diverge. Over time, drift is inevitable.
- **Stringly-typed enums.** Because SQLite lacks native enum support, all enums are `String` fields with comments documenting the allowed values. This pushes validation entirely to the application layer. A typo in a status string can corrupt data. The Postgres schema also uses `String` for consistency, which wastes Postgres’s `CHECK` and native enum capabilities.
- **Missing CHECK constraints.** `SwapReview.rating` is documented as `1..5`, but there is no `CHECK (rating BETWEEN 1 AND 5)` in the Postgres schema (and Prisma+SQLite can’t express it). The same applies to `AppFeedback.score`.
- **JSON stored as TEXT.** `photos`, `tags`, `interests`, `settings`, `contactChannels`, and many others are `String` fields containing JSON. This is documented as "SQLite-friendly," but it means no database-level JSON validation, no partial indexing, and no type-safe queries. The `parseJSON` utility is used everywhere; a malformed JSON string will silently fall back to `[]` or `{}` in many code paths.
- **No connection pooling configuration.** The `PrismaPg` adapter is used in production, but there is no mention of `pgBouncer` or `Neon` serverless connection pooling. Under Vercel’s serverless model, high-traffic spikes could exhaust Postgres connections.

### 4. Authentication & Authorization

**What’s done well:**
- **Fail-closed security:** `session.ts` throws in production if `SESSION_SECRET` is missing or too short. The dev fallback is clearly labeled as insecure and warns on first use.
- **Timing-safe comparison** (`timingSafeEqual`) is used for HMAC signature verification.
- **Bearer tokens for mobile** are hashed with SHA-256 before storage, only the raw token is returned once. Tokens have a 30-day sliding window and can be revoked.
- **Role-based checks** are centralized in `lib/auth/abilities.ts`. Admin gating is explicit (`requireAdmin`, `requireAdminPage`), and plan-limit checks are cleanly separated.
- **Suspended accounts** are checked at the route level (not just session decode), which is correct because cookie sessions are stateless.
- **WebAuthn passkeys** are supported with proper counter incrementation for clone detection.
- **OAuth accounts** have a unique constraint on `(provider, providerUserId)` and same-email linking with verified-email gating.

**Concerns:**
- **Custom auth is explicitly a "demo."** The top comment in `session.ts` says: "Production note: switch to iron-session or NextAuth before launch." This is a serious liability. HMAC-SHA256 cookies are secure if implemented correctly, but rolling your own session system is risky. The codebase already has `next-auth` and `@auth/prisma-adapter` as dependencies but does not use them.
- **No refresh token rotation.** The 30-day cookie is fixed. There is no mechanism for refreshing or rotating session secrets mid-flight.
- **No CSRF protection on bearer tokens.** Mobile clients use `Authorization: Bearer <token>`; if a token is exfiltrated, there is no binding to the device.
- **Ability checks repeat DB queries.** `requireUser()` fetches the user from DB on every call. For admin pages, this means two DB hits (session + user) per request. There is no in-memory caching of user roles or plan status.
- **Plan resolution is N+1 prone.** `getEffectivePlan()` queries `User` (for admin bypass), then `OrganizationMember`, then `Subscription`. This is fine for single calls but could be a bottleneck if batched.

### 5. Scalability & Performance

**What’s done well:**
- **Throttled activity tracking.** `lib/auth/activity.ts` uses an in-process `Map` to throttle `lastActiveAt` updates to once per 5 minutes, plus a DB-level `WHERE` guard to prevent write amplification across instances.
- **Lazy Prisma client.** The Proxy pattern in `prisma.ts` prevents DB connection during `next build` page-data collection. This is essential for serverless builds.
- **Fire-and-forget notifications.** Email and push are sent with `.catch()` so failures never block the request thread.
- **Availability queries are batched.** `bookedRangesFor()` uses `Promise.all` to load agreements, stays, and blocked ranges in parallel.

**Concerns:**
- **No caching layer.** There is no Redis, no in-memory cache, and no Next.js `unstable_cache` usage. Every listing browse, every availability check, and every plan resolution hits the database directly. As the marketplace grows, this will become a bottleneck.
- **N+1 queries in proposals.** `app/app/api/proposals/route.ts` (lines 18–31) fetches proposals, then iterates to collect `otherIds`, then queries `prisma.user.findMany` for names/avatars. This is two queries, but it could be one with a Prisma `include` on the proposal query. More importantly, `coverPhotoUrl` parses JSON on every row in the loop.
- **No database-level query optimization.** The `SwapProposal` query in the proposals route includes `proposerListing` and `targetListing` with `photos: true` (a JSON string), meaning large photo arrays are fetched and parsed even when only the first photo is needed.
- **Vercel Hobby cron limit.** The daily cron fans out to 9 sub-jobs sequentially. As the job list grows, this will exceed the 10-second serverless timeout on the Hobby plan. The code comments acknowledge this but do not offer a mitigation.
- **Next.js canary version.** `next@16.3.0-canary.8` is used in production. Canary builds are not guaranteed to be stable. The `overrides` section forces this version even if other packages request a different one.

### 6. Error Handling & Observability

**What’s done well:**
- **Structured logging.** `lib/log/index.ts` (referenced by `createLogger`) provides a typed logger. `lib/log/sentry.ts` is env-gated and lazily loads `@sentry/node` so it never affects client bundles.
- **Instrumentation hook.** `instrumentation.ts` follows the Next.js convention for server startup and request-error capture.
- **Defensive error swallowing.** Best-effort paths (anchor, push notifications, referrer notifications) all catch and log errors without failing the request.
- **Error classification.** `PlanLimitError`, `KeysLedgerError`, `BillingNotConfigured`, and `ListingDateOverlapError` are custom error types that carry semantic meaning.

**Concerns:**
- **No distributed tracing.** With Sentry traces disabled (`tracesSampleRate: 0`), there is no way to follow a request across DB queries, external API calls, and cron jobs.
- **No metrics pipeline.** There is no Prometheus, Datadog, or Vercel Analytics integration for business metrics (proposal funnel, conversion rates, Keys spend velocity). The only analytics are `@vercel/analytics` (page views) and `MarketingEvent` rows.
- **Cron job failures are logged but not alerted.** If a daily cron job fails, the system returns `500` to Vercel, but there is no escalation path (PagerDuty, Slack webhook, etc.).
- **Silent failures in fire-and-forget.** While `.catch()` is pragmatic, it means a broken email provider or push service could go unnoticed for days.

### 7. Testing Strategy

**What’s done well:**
- **Extensive test coverage.** The `app/test/` directory contains 100+ test files covering domains: auth, billing, keys, proposals, admin, cron, insurance, referrals, and more. This is exceptional for a startup codebase.
- **Unit tests for pure logic.** `lib/keys/value.ts` and `lib/insurance/pricing.ts` are easily testable because they are deterministic and side-effect-free.
- **Route-level integration tests.** Tests exercise the actual API routes (e.g., `proposals-inbox.test.ts`, `keys-ledger.test.ts`), validating end-to-end behavior with the real Prisma client.
- **Test environment configuration.** `vitest.config.ts` sets `ALLOW_INSECURE_CRON: "1"` so cron tests can run without a bearer token, while the auth gate itself is tested separately.
- **Activity throttle reset.** `__resetActivityThrottleForTests()` in `lib/auth/activity.ts` is a thoughtful test hook.

**Concerns:**
- **No e2e tests.** There is no Playwright, Cypress, or Maestro test suite. The complex user flows (signup → create listing → send proposal → accept → check-in → review) are only tested at the unit/integration level.
- **Database state is shared.** Tests use the same SQLite database (`dev.db`) as local development. Without a test-database isolation strategy (e.g., `prisma migrate reset` per test run), test data can leak and cause flakiness. The `db:test` script is not documented.
- **No contract testing.** The OpenAPI spec is not tested against the actual API responses. A route could change its JSON shape without breaking any test, but the iOS/Android clients would fail at runtime.
- **Mocking is ad-hoc.** External services (Stripe, Resend, FCM, AI providers) are mocked inconsistently. Some tests rely on env-gated no-ops (e.g., Sentry without `SENTRY_DSN`), while others require explicit mocks.

### 8. Build & Deployment

**What’s done well:**
- **Two-project Vercel setup.** The `app/` and `marketing/` directories deploy as separate Vercel projects with path-filtered builds, which is a clean separation.
- **Security headers.** `next.config.ts` applies HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP `frame-ancestors`, and `Permissions-Policy` to every response.
- **Graceful degradation.** Missing env vars (Stripe, Resend, FCM, AI keys) do not crash the app; they return 503 or fall back to console logging/templates.
- **Postinstall schema selection.** The `postinstall` script dynamically selects the correct Prisma schema based on `VERCEL`, which prevents build-time schema mismatches.

**Concerns:**
- **Build-time schema synchronization risk.** The `vercel-build` script runs `prisma generate --schema prisma/schema.postgres.prisma && node scripts/sync-prod-schema.mjs && next build`. If `sync-prod-schema.mjs` fails or applies a destructive change, the build fails or corrupts production. There is no dry-run or rollback mechanism.
- **No Docker or containerization.** The entire deployment depends on Vercel’s serverless environment. There is no local production parity (e.g., Docker Compose with Postgres), making it hard to reproduce production issues.
- **Environment variable sprawl.** There are 20+ required env vars for full functionality. No `.env.example` is mentioned in the docs, and no validation schema (e.g., `envalid`, `zod` for env vars) ensures all required vars are present at startup.
- **Marketing redirects are temporary.** The `MARKETING_PATHS` redirects in `next.config.ts` use `permanent: false`, which means SEO juice is not transferred and old links will continue to hit the app server indefinitely.
- **`next.config.ts` forces `cpus: 4`** to work around a Next.js 16.2.4 prerender bug. This is a hack that should be removed once the upstream bug is fixed.

### 9. Security Architecture

**What’s done well:**
- **Defense in depth for auth:** HMAC-signed cookies, httpOnly, sameSite=lax, secure in production, bearer tokens hashed at rest, SHA-256 for email tokens, bcrypt for passwords.
- **Rate limiting.** Signup (10/h/IP), login (30/5min/IP), proposals (10/day/user), and Turnstile captcha on signup.
- **Input validation.** Zod schemas (`swapProposalSchema`, `tokenIssueSchema`, etc.) are used in route handlers.
- **Row-level authorization.** `requireUser()` + `requireAdmin()` ensure users cannot access other users’ data by ID manipulation. Conversation access is checked via `canAccessConversation()`.
- **PII minimization.** AI property-document analysis explicitly avoids storing the titleholder name. Travel profiles are built from in-app signals only. Location tracking is coarse (city/region) and opt-in.
- **Secrets never reach the browser.** `getStripe()` is marked with `"server-only"`, and the Sentry DSN is server-only.

**Concerns:**
- **Custom auth is still a risk.** The HMAC session system is well-written but not battle-tested. The `dev-secret-please-change-this-to-32-random-bytes-minimum` fallback is a footgun for developers.
- **No rate limiting on listing browse or public APIs.** An attacker can scrape listings, city data, or user profiles without hitting a rate limit.
- **No content security policy (CSP) for scripts/styles.** The `next.config.ts` only sets `frame-ancestors 'none'`. There is no `script-src`, `style-src`, or `img-src` CSP, which leaves the app open to XSS if a user-controlled field is rendered unsafely.
- **No CORS configuration.** The API routes do not explicitly set CORS headers. If the marketing site or a future web client is hosted on a different domain, this will cause issues.
- **Stripe webhook lacks IP allowlist.** The webhook endpoint accepts any request with a valid signature, which is correct, but there is no additional network-layer protection (e.g., Vercel firewall rules) documented.
- **AI API keys stored in plaintext.** `User.aiApiKey` is documented as "encrypted at rest for new writes," but the backfill script (`scripts/backfill-ai-api-keys.ts`) is only mentioned, not enforced. Legacy rows may still hold plaintext keys.

### 10. Maintainability

**What’s done well:**
- **Excellent inline documentation.** Nearly every file, function, and schema field has a comment explaining the "why." This is a standout strength.
- **Consistent file naming and conventions.** `kebab-case` for files, `PascalCase` for models, `camelCase` for variables. Commit messages are scoped by surface (`feat(web):`, `ios:`, etc.).
- **Feature flags and env-gating.** TON anchoring, AI property analysis, insurance provider selection, and many other features are toggled via env vars, allowing safe incremental rollouts.
- **Prisma schema as documentation.** The schema file is the single source of truth for the data model, and the comments make it readable by non-technical stakeholders.

**Concerns:**
- **Dual-schema maintenance is a ticking time bomb.** The two Prisma schemas are identical by policy, but there is no automated check in CI that verifies this. A future developer could change one and forget the other, causing a production-only bug.
- **No API deprecation strategy.** Old fields (e.g., `SwapMessage.readAt` marked as DEPRECATED) are kept nullable but never removed. Over time, this will bloat the schema and the code.
- **Tight coupling to Prisma.** The entire codebase assumes Prisma. If the team ever needs to switch to Drizzle, raw SQL, or a different ORM, the refactor surface is enormous.
- **No linting or formatting rules shown.** The `package.json` includes `eslint` and `eslint-config-next`, but no `.eslintrc` or `prettier` config was reviewed. Consistency is maintained by convention, not by tooling.
- **Legacy fields accumulate.** `motifHint` is labeled legacy, `cityTier` is kept for back-compat, `readAt` is deprecated. There is no migration plan to remove these.

---

## Specific Problems Found

### [CRITICAL] Production schema changes via `prisma db push` with no migrations
- **Location:** `docs/DATABASE.md` (lines 18–20), `app/package.json` scripts
- **Description:** The production database is synced with `prisma db push --schema prisma/schema.postgres.prisma`. There are no migration files, no `prisma migrate deploy`, and no rollback strategy. The team relies on an "additive changes only" policy, but this is not enforced by CI.
- **Impact:** A developer could accidentally run a destructive schema change (e.g., rename a column, drop a table) that loses data in production. There is no audit trail of schema changes.
- **Recommendation:** Introduce `prisma migrate dev` for local development and `prisma migrate deploy` for production. Store migration files in `prisma/migrations/`. Use `prisma db pull` only for introspection, never `db push` in production.

### [CRITICAL] Custom auth system labeled as "demo" with production launch risk
- **Location:** `app/lib/auth/session.ts` (line 2), `app/package.json` (dependencies include `next-auth`)
- **Description:** The session system is explicitly documented as a demo implementation designed to be replaced by NextAuth or iron-session before launch. Yet `next-auth` is already a dependency and unused. The HMAC cookie is secure if configured correctly, but it lacks features like session rotation, OAuth, and social login out of the box.
- **Impact:** Launching with a custom auth system increases security risk and support burden. OAuth (Google, Apple) is already planned but not implemented.
- **Recommendation:** Migrate to `next-auth` v5 (Auth.js) with the Prisma adapter before public launch. This will give you OAuth, session rotation, and battle-tested security for free.

### [HIGH] Next.js canary version in production
- **Location:** `app/package.json` (line 67, 101)
- **Description:** The app uses `next@16.3.0-canary.8`, forced via `overrides`. Canary builds are pre-release and may contain regressions, breaking changes, or security issues.
- **Impact:** A canary regression could cause build failures, runtime crashes, or data corruption in production. The `cpus: 4` workaround in `next.config.ts` is already evidence of a canary-specific bug.
- **Recommendation:** Pin to a stable Next.js release (e.g., `16.2.x` or `16.3.0` when available). Remove the `overrides` block.

### [HIGH] No caching layer for hot read paths
- **Location:** `app/lib/db/prisma.ts`, `app/lib/keys/ledger.ts`, `app/lib/billing/limits.ts`
- **Description:** Every request that reads a listing, resolves a plan, or checks availability queries the database directly. There is no Redis, no Memcached, and no Next.js `unstable_cache`.
- **Impact:** As the marketplace grows, listing browse, availability checks, and proposal inboxes will become database-bound. A single popular listing could trigger hundreds of identical availability queries per minute.
- **Recommendation:** Introduce a caching layer for:
  - Listing availability snapshots (TTL: 5 minutes)
  - User plan/effective plan (TTL: 1 minute, or invalidate on webhook)
  - City tiers and city media (TTL: 1 hour)
  - Use `unstable_cache` for server components and Redis for API routes.

### [HIGH] No API versioning
- **Location:** `app/app/api/` (all routes)
- **Description:** The API is flat and unversioned. Native clients (iOS/Android) ship with compiled API client code. If a breaking change is made to `/api/proposals`, existing app versions will break.
- **Impact:** Forcing users to update their native app for a backend change is a poor UX and can cause app store rejections or churn.
- **Recommendation:** Introduce URL versioning: `/api/v1/proposals`, `/api/v2/proposals`. Keep v1 stable for at least 6 months. Use the OpenAPI spec to enforce backward compatibility.

### [MEDIUM] Stringly-typed enums without database validation
- **Location:** `app/prisma/schema.prisma` (passim), `app/prisma/schema.postgres.prisma` (passim)
- **Description:** All enums (`status`, `role`, `kind`, `source`, etc.) are `String` fields. The Postgres schema also uses `String` for consistency, even though Postgres supports `enum` and `CHECK` constraints.
- **Impact:** A typo in a status string (e.g., `"actve"` instead of `"active"`) will be accepted by the database and could corrupt business logic. The application layer is the only guard.
- **Recommendation:** In the Postgres schema, use `enum` types or `CHECK` constraints for all closed-set fields. For SQLite, add a Prisma middleware that validates string enums before write.

### [MEDIUM] N+1 query patterns in proposal and message routes
- **Location:** `app/app/api/proposals/route.ts` (lines 33–44), `app/app/api/conversations/[id]/messages/route.ts` (inferred)
- **Description:** The proposals route fetches proposals, then iterates to collect `otherIds`, then runs a second `prisma.user.findMany` query. It also parses `photos` JSON for every listing in the loop.
- **Impact:** Under high load, this creates extra round-trips and CPU overhead.
- **Recommendation:** Use Prisma `include` with nested selects to fetch the other party’s name/avatar in the initial query. Or introduce a read-model / DTO layer that pre-joins data.

### [MEDIUM] Missing connection pooling for serverless Postgres
- **Location:** `app/lib/db/prisma.ts` (lines 12–15)
- **Description:** The `PrismaPg` adapter is instantiated with a raw `DATABASE_URL`. On Vercel’s serverless platform, each function invocation creates a new connection. Without a pooler (e.g., `pgBouncer`, `Neon` serverless driver, or `Prisma Accelerate`), connection exhaustion is likely under load.
- **Impact:** Intermittent `too many connections` errors, request timeouts, and degraded user experience.
- **Recommendation:** Use `Neon` serverless driver with `prisma/adapter-neon`, or add `pgBouncer` to the connection string. Alternatively, use Prisma Accelerate for connection pooling.

### [MEDIUM] `ALLOW_INSECURE_CRON` in test config could leak to production
- **Location:** `app/vitest.config.ts` (line 19)
- **Description:** The Vitest config sets `ALLOW_INSECURE_CRON: "1"` globally. If tests are accidentally run against a production database, or if this env var is picked up by a production process, the cron auth gate is bypassed.
- **Impact:** Unauthorized cron execution could trigger billing events, send duplicate emails, or modify data.
- **Recommendation:** Set `ALLOW_INSECURE_CRON` only in local `.env` and CI test scripts, not in the vitest config file. Add a test that verifies cron routes return 403 when the env var is absent.

### [LOW] Marketing redirects are temporary (302), not permanent (301)
- **Location:** `app/next.config.ts` (lines 69–73)
- **Description:** Marketing path redirects use `permanent: false`, meaning they return HTTP 302. Search engines will not transfer ranking to the new marketing domain, and browsers will continue to hit the app server for every redirect.
- **Impact:** SEO dilution and unnecessary server load after the domain cutover.
- **Recommendation:** After the cutover is complete and verified, set `permanent: true` (301) for all marketing redirects.

### [LOW] AI API keys may be stored in plaintext
- **Location:** `app/prisma/schema.prisma` (line 46), `app/prisma/schema.postgres.prisma` (line 46)
- **Description:** `User.aiApiKey` is documented as "encrypted at rest for new writes," but the backfill script is optional. The schema has no encryption-at-rest mechanism (e.g., Prisma middleware, column-level encryption).
- **Impact:** If the database is breached, user AI API keys are exposed.
- **Recommendation:** Enforce encryption via a Prisma middleware that encrypts `aiApiKey` on write and decrypts on read. Run the backfill script as a mandatory migration step.

---

## Improvement Recommendations (prioritized)

### 1. Critical structural changes (do before launch)
1. **Replace `prisma db push` with formal migrations.** Add `prisma/migrate/` to version control, use `prisma migrate deploy` in production, and block PRs that modify schema without a migration.
2. **Migrate auth to NextAuth.js (Auth.js) v5.** Deprecate the custom HMAC session and use the existing `next-auth` dependency. This gives OAuth, session rotation, and security updates for free.
3. **Pin Next.js to a stable release.** Remove the canary override and the `cpus: 4` workaround.
4. **Add a caching layer.** Start with `unstable_cache` for listing browse and city tiers, then add Redis for plan resolution and availability.
5. **Introduce API versioning.** Move all routes under `/api/v1/` and keep the old paths as aliases for backward compatibility during the transition.

### 2. Medium-term refactoring targets (3–6 months)
1. **Automate dual-schema sync.** Write a CI check (or a script) that verifies `schema.prisma` and `schema.postgres.prisma` are identical except for the `provider` line. Fail the build on divergence.
2. **Add Postgres CHECK constraints.** For the Postgres schema, add `CHECK` constraints on all enum-like fields (rating 1..5, status closed sets, etc.).
3. **Extract a read-model / DTO layer.** Create `lib/dto/` or `lib/queries/` that returns shaped objects instead of raw Prisma results. This prevents accidental field leaks and centralizes serialization logic.
4. **Fix connection pooling.** Switch to `prisma/adapter-neon` or Prisma Accelerate for serverless-friendly Postgres connections.
5. **Add e2e test coverage.** Introduce Playwright for web flows and Maestro for mobile flows. At minimum, test: signup → create listing → send proposal → accept → review.
6. **Enforce OpenAPI contract on the backend.** Use a library like `openapi-backend` or `zod-to-openapi` to validate that every route’s request/response matches the spec in `packages/api-spec/`.

### 3. Long-term architectural evolution (6–12 months)
1. **Consider a separate API service.** As the native apps and marketing site grow, the Next.js App Router may become a bottleneck for API throughput. Extract a standalone Node.js/Express/Fastify API service that the web app proxies to.
2. **Event-driven architecture.** Replace fire-and-forget notifications with a proper event bus (e.g., Inngest, SQS, or a Postgres-backed queue). This enables reliable retries, observability, and decoupled workers.
3. **Read replicas.** As the listing catalog grows, move read-heavy queries (browse, search, availability) to a read replica or a dedicated search index (Elasticsearch, Meilisearch, or Postgres full-text search).
4. **Replace string-based JSON with native types.** When SQLite is no longer needed for local dev (e.g., if the team standardizes on Docker with Postgres), migrate all `String` JSON fields to `Json` or normalized tables for type safety and queryability.
5. **Implement a proper CI/CD pipeline with staging.** Add a staging environment that mirrors production (Vercel preview + Neon staging branch) and runs the full test suite before deploying to production.

---

*Review compiled from source analysis of 30+ critical files across the Swapl monorepo.*
