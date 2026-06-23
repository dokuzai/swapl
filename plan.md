# Swapl Deep Analysis & Pentest Plan

## Project Overview
- **Name**: Swapl — home-swap marketplace
- **Stack**: Next.js 15 (App Router), Prisma ORM, SQLite (dev) / PostgreSQL (prod), Stripe, Resend, UploadThing
- **Auth**: Custom HMAC-SHA256 signed cookies + opaque bearer tokens for mobile
- **Mobile**: iOS (SwiftUI) + Android (Kotlin) native apps consuming REST API
- **Monorepo**: pnpm workspace with `app/`, `marketing/`, `ios/`, `android/`, `packages/`
- **Deployment**: Vercel, two projects (app + marketing)

## Stage 1: Parallel Deep Analysis (3 agents)

### Agent 1: Security_Pentest_Agent
**Focus**: Authentication, authorization, API security, data exposure, injection, secrets, rate limiting, CSRF, XSS, IDOR, business logic flaws
**Directories to scan**:
- `app/lib/auth/` (session, tokens, passwords, OTP, passkeys, web-providers)
- `app/app/api/` (all 144 API routes)
- `app/lib/rate-limit.ts`, `app/lib/turnstile.ts`
- `app/lib/email/`, `app/lib/billing/`, `app/lib/db/`
- `app/prisma/schema.prisma` and `app/prisma/schema.postgres.prisma`
- `app/app/admin/` (admin access controls)
- `app/lib/validators.ts` (input validation)
- Any `.env` references or hardcoded secrets in source

**Key concerns to investigate**:
1. Session cookie security (`sameSite: "lax"`, `secure` flag, `httpOnly`)
2. HMAC signing with fallback secret in dev
3. Bearer token handling and sliding window
4. Password hashing (bcryptjs with cost 10)
5. Email token one-shot consumption (race conditions)
6. Rate limiting bypasses (IP spoofing, Upstash fallback)
7. Admin route protection (RBAC enforcement)
8. Prisma query injection risks
9. File upload security (UploadThing configuration)
10. Stripe webhook security
11. CORS configuration
12. OAuth implementation (Google, Apple, Telegram)
13. WebAuthn implementation
14. Data exposure in API responses (over-fetching)
15. IDOR vulnerabilities (can user A access user B's data?)
16. SQL injection via raw queries
17. NoSQL injection via JSON fields
18. Cron endpoint security (`CRON_SECRET`)

### Agent 2: Architecture_Review_Agent
**Focus**: Code organization, design patterns, coupling, scalability, performance, maintainability
**Directories to scan**:
- `app/lib/` (business logic modules)
- `app/app/api/` (API route organization)
- `app/app/(auth)/`, `app/app/admin/`, `app/app/dashboard/`, `app/app/swaps/`
- `packages/` (shared contracts)
- `docs/` (architecture docs)
- `app/prisma/` (database design)
- `app/next.config.ts`, `app/instrumentation.ts`

**Key concerns to investigate**:
1. Monorepo boundaries and package separation
2. API route organization (REST vs RPC)
3. Database schema design (dual schema maintenance SQLite/Postgres)
4. Prisma client instantiation (lazy proxy pattern)
5. Business logic coupling in API routes vs. service layer
6. Error handling patterns (apiError vs throwing)
7. Type safety (generated Prisma types vs custom types)
8. Caching strategy (or lack thereof)
9. Build/deployment complexity (dual schema, postinstall hooks)
10. i18n approach
11. Test coverage (vitest config, test files)
12. State management (Zustand on client?)
13. Data fetching patterns (Server Components vs Client Components)
14. Database indexing strategy
15. Transaction boundaries (especially for swaps, billing, keys ledger)

### Agent 3: Code_Quality_BugHunt_Agent
**Focus**: Bugs, logic errors, type issues, edge cases, race conditions, resource leaks, incorrect null checks
**Directories to scan**:
- `app/lib/` (all business logic files)
- `app/app/api/` (critical routes: auth, proposals, billing, swaps, admin)
- `app/test/` (existing tests for gaps)
- `app/app/admin/` (admin operations)
- `app/lib/keys/`, `app/lib/billing/`, `app/lib/insurance/`
- `app/lib/conversation/`, `app/lib/growth/`

**Key concerns to investigate**:
1. Race conditions in token consumption (email verification, password reset)
2. Race conditions in swap proposal acceptance
3. Double-spending in Keys economy (ledger consistency)
4. Race conditions in billing (Stripe webhooks, idempotency)
5. Incorrect Prisma relations / cascade deletes
6. Missing error handling in async operations
7. Null/undefined dereferences
8. Date/time handling bugs (timezones, DST)
9. Integer overflow/underflow in financial calculations
10. Off-by-one errors in availability logic
11. Incorrect array/string operations on JSON fields
12. Unhandled promise rejections
13. Type assertion unsafety (`as` casts)
14. Incorrect use of `Promise.all` with dependent operations
15. Resource leaks (DB connections, file handles)

## Stage 2: Synthesis & Fix
- Merge findings from all 3 agents
- Prioritize by severity (Critical / High / Medium / Low)
- Produce fixes for Critical and High issues
- Log everything to `security-audit-log.md`

## Stage 3: Report
- Compile final report with: Executive Summary, Pentest Results, Architecture Review, Bug Fixes, Recommendations
- Save as `.docx` if report-writing skill is used
