# Swapl Fix Log — 2026-06-19

This file documents every code change applied during the deep analysis & pentest session.

## Changes by File

### `app/lib/auth/tokens.ts`
- **SWP-001 / TOK-001:** Made `consumeToken` atomic using `updateMany` with `usedAt: null` guard. Two concurrent consumes now result in exactly one success.
- **TOK-002:** Added null guard `row.expiresAt != null` before `<= new Date()` comparison to prevent false "expired" when `expiresAt` is null.

### `app/lib/auth/otp.ts`
- **SWP-002 / OTP-001:** Made `verifyOtp` atomic using `updateMany` with `consumedAt: null` guard. Fixed attempt counter to read the updated value after atomic increment.
- **OTP-002:** Added null guard `row.expiresAt != null` before `<= new Date()` comparison.

### `app/lib/auth/session.ts`
- **SES-001:** Added null guard `row.expiresAt != null` in `getSessionFromBearer` to prevent false "expired" rejection.

### `app/app/api/auth/token/route.ts`
- **SWP-003:** Added dual-layer durable rate limiting (`checkRateLimitDurable`) to mobile bearer-token login: 30 attempts / 5 min per IP, 10 attempts / 15 min per email. Resets counters on successful login.

### `app/app/api/auth/verify-email/[token]/route.ts`
- **SWP-004:** Added `checkRateLimitDurable` (`verify-email:${ip}`, 10/hour) to prevent unauthenticated token scanning and brute-force verification attempts.

### `app/app/api/auth/forgot-password/route.ts`
- **SWP-005:** Replaced `checkRateLimit` (in-memory) with `checkRateLimitDurable` so the rate limit is effective across serverless invocations.

### `app/app/api/auth/oauth/google/route.ts`
- **SWP-006:** Replaced `checkRateLimit` with `checkRateLimitDurable`.

### `app/app/api/auth/oauth/apple/route.ts`
- **SWP-006:** Replaced `checkRateLimit` with `checkRateLimitDurable`.

### `app/app/api/auth/oauth/telegram/route.ts`
- **SWP-006:** Replaced `checkRateLimit` with `checkRateLimitDurable`.

### `app/lib/keys/ledger.ts`
- **KEYS-001:** Rewrote `applyWithinTx` to use atomic `increment` (`keysBalance: { increment: delta }`) instead of read-modify-write. If the resulting balance is negative, the increment is reversed and `NEGATIVE_BALANCE` is thrown.
- **GIFT-001:** Added optional `validate` callback to `gift()` function so callers can enforce caps inside the same transaction.

### `app/app/api/keys/gift/route.ts`
- **GIFT-001:** Moved daily/monthly cap checks from outside the transaction to inside via the `validate` callback on `gift()`. Uses `tx.keysTransaction.aggregate` for transaction-scoped counts.
- Removed standalone `giftedSince` calls (now done inside the transaction).

### `app/lib/growth/referrals.ts`
- **REF-001:** `rewardedReferralsSince` now accepts optional `tx` parameter and uses it instead of global `prisma`. Inside `qualifyReferralsForReferee`, the cap check reads from the transaction client so concurrent qualifications see each other.
- **REF-002:** Deduplicated `rewardedOwnerIds` with `[...new Set(...)]` before sending push notifications.

### `app/lib/billing/limits.ts`
- **PROP-001:** Wrapped `ensureCanCreateProposal` in a single `prisma.$transaction`: reads user, optionally resets counter, checks limit, and increments atomically.
- **LIM-001:** Added null-safe `?.getTime() ?? 0` for `proposalsCounterResetAt`.
- Removed `bumpProposalCounter` (functionality now inside `ensureCanCreateProposal`).

### `app/app/api/proposals/route.ts`
- **PROP-001:** Removed `bumpProposalCounter` call (now handled inside `ensureCanCreateProposal`).
- **SWP-006-adjacent:** Replaced `checkRateLimit` with `checkRateLimitDurable` for proposal anti-burst rate limit.

### `app/app/api/proposals/[id]/route.ts`
- **SWP-008:** Replaced `Math.random()` with `crypto.randomInt()` for swap key codes (`randomInt(1000, 10000)`) and fallback policy numbers (`randomInt(0, 1_000_000)`).
- Added `import { randomInt } from "node:crypto"`.

### `app/lib/keys/earn.ts`
- **SHR-001:** Replaced non-atomic `update` with `updateMany({ where: { id, convertedById: null } })` in `grantShareConvertedBonus`. If no rows are updated, returns `already_converted`.

### `app/lib/keys/value.ts`
- **DST-001:** Changed `nightsBetween` from `Math.floor(diffMs / NIGHT_MS)` to `Math.round(diffMs / NIGHT_MS)` so DST ±1h transitions do not cause off-by-one errors.

### `app/lib/rate-limit.ts`
- **RL-001:** Added expired bucket pruning loop in `checkRateLimit`: iterates all entries and deletes those whose `resetAt` has passed. Prevents unbounded memory growth.

### `app/app/api/cron/daily/route.ts`
- **DLY-001:** Wrapped each job in `Promise.race` with a 30-second timeout so one hanging job cannot block the entire daily cron.
- **DLY-002:** Added `content-type` check before calling `res.json()`; falls back to `res.text()` for non-JSON responses. Prevents false-positive failure logs.

### `app/app/api/admin/signups/export/route.ts`
- **SWP-014:** Extended `csvCell` to prefix formula-triggering characters (`=`, `+`, `-`, `@`, tab) with a single quote, preventing CSV formula injection attacks.

### `app/lib/insurance/mock.ts`
- **INS-002:** Replaced `Math.random()` with `crypto.randomInt()` for mock policy number generation.
- Added `import { randomInt } from "node:crypto"`.

### `app/lib/billing/checkout.ts`
- **CHK-001:** `APP_URL` now throws `Error("NEXT_PUBLIC_APP_URL is required but not set")` instead of silently falling back to `http://localhost:3000`. Prevents production redirects to localhost.

### `app/app/api/billing/checkout/subscription/route.ts`
- **SWP-013:** Changed `getSession()` to `getSessionFromRequest(req)` so mobile bearer-token users can access subscription checkout.

### `app/app/api/billing/cancel/route.ts`
- **SWP-013:** Changed `getSession()` to `getSessionFromRequest(req)` and `POST()` to `POST(req)` so mobile users can cancel subscriptions.

### `app/app/api/billing/portal/route.ts`
- **SWP-013:** Changed `getSession()` to `getSessionFromRequest(req)` and `POST()` to `POST(req)` so mobile users can access the billing portal.

### `app/lib/validators.ts`
- **VAL-001:** Added `.refine()` to `listingCreateSchema` ensuring `availableTo > availableFrom` and `maxStayDays >= minStayDays`.
- Added `.refine()` to `swapProposalSchema` ensuring `dateTo > dateFrom`.
- Added `.refine()` to `swapCounterSchema` ensuring `counterDateTo > counterDateFrom`.

---

*Total files modified: 26*
*Total fixes applied: 24 distinct bug/security issues*
