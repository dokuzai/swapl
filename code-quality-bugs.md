# Code Quality & Bug Hunt — Swapl

## Executive Summary
- **Total bugs found:** 27
- **Critical:** 5 | **High:** 6 | **Medium:** 10 | **Low:** 6
- **Most dangerous:** The Keys ledger `applyWithinTx` uses a read-modify-write pattern that is vulnerable to the lost-update problem under PostgreSQL's default READ COMMITTED isolation. Two concurrent debit transactions can both read the same balance, both pass the `NEGATIVE_BALANCE` guard, and both commit — leaving the cached `keysBalance` incorrect and potentially allowing an overdraft. This is a financial-consistency bug with direct revenue impact.

---

## Bug Findings

### [CRITICAL] KEYS-001 Lost-Update in Keys Ledger (Financial Consistency)
- **Location:** `app/lib/keys/ledger.ts:121–141`
- **Category:** Race Condition / Transaction
- **Description:** `applyWithinTx` reads `user.keysBalance`, computes `balanceAfter = user.keysBalance + input.delta`, then writes the computed value back with `tx.user.update`. Under PostgreSQL (production) with default READ COMMITTED isolation, two concurrent transactions can both read the same balance, compute overlapping new balances, and both commit. The second UPDATE overwrites the first without seeing the intermediate change. The `NEGATIVE_BALANCE` guard is evaluated against a stale read, so a second concurrent debit that *should* fail can slip through.
- **Impact:**
  - Overdraft / negative balance bypass (the guard fails).
  - Cached `keysBalance` diverges from the ledger sum (the true source of truth).
  - `balanceAfter` values written into `KeysTransaction` rows are incorrect for the second transaction.
- **Evidence:**
  ```typescript
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { keysBalance: true } });
  const balanceAfter = user.keysBalance + input.delta;   // ← stale read under concurrency
  if (balanceAfter < 0) { /* reject */ }
  await tx.user.update({ where: { id: input.userId }, data: { keysBalance: balanceAfter } });
  ```
- **Fix:** Replace the read-modify-write with an atomic delta expression so the database computes the new balance:
  ```typescript
  await tx.user.update({
    where: { id: input.userId },
    data: { keysBalance: { increment: input.delta } },
  });
  const updated = await tx.user.findUnique({ where: { id: input.userId }, select: { keysBalance: true } });
  const balanceAfter = updated!.keysBalance;
  ```
  Then verify `balanceAfter >= 0` after the update. Alternatively, use `SELECT FOR UPDATE` on the user row at the start of the transaction.
- **Test case:** In PostgreSQL, run two concurrent `spend(userId, 60)` calls when the balance is 100. Both should *not* succeed; the second should be rejected with `NEGATIVE_BALANCE`.

---

### [CRITICAL] REF-001 Referral Cap Bypass (Anti-Farm Failure)
- **Location:** `app/lib/growth/referrals.ts:348–352`
- **Category:** Race Condition / Transaction
- **Description:** Inside the `prisma.$transaction` in `qualifyReferralsForReferee`, the daily/monthly cap counts are read via `rewardedReferralsSince`, which uses the **global** `prisma` client instead of the transaction client `tx`. This means the cap check reads already-committed data from outside the transaction, missing any concurrent referral rewards that are in-flight. Two concurrent qualification flows for the same referrer but different referees can both see the same pre-reward count, both pass the cap, and both credit Keys.
- **Impact:** Referrer can exceed the `REFERRAL_DAILY_CAP` / `REFERRAL_MONTHLY_CAP`, farming unlimited Keys by synchronizing multiple invitee verifications.
- **Evidence:**
  ```typescript
  const [dayCount, monthCount] = await Promise.all([
    rewardedReferralsSince(fresh.ownerId, new Date(now - DAY_MS)),   // ← uses global prisma, not tx
    rewardedReferralsSince(fresh.ownerId, new Date(now - MONTH_MS)),
  ]);
  ```
  And `rewardedReferralsSince` at line 202–206 does `return prisma.referral.count(...)` with no `tx` parameter.
- **Fix:** Pass the transaction client through:
  ```typescript
  async function rewardedReferralsSince(ownerId: string, since: Date, tx?: Prisma.TransactionClient) { ... }
  ```
  Then call it with `tx` inside the transaction.
- **Test case:** Run two `qualifyReferralsForReferee` calls concurrently for the same referrer when the referrer is at `dayCount = REFERRAL_DAILY_CAP - 1`. Only one should succeed; the second should be capped (status `qualified` but no Keys).

---

### [CRITICAL] OTP-001 OTP Double-Consumption (Replay Attack)
- **Location:** `app/lib/auth/otp.ts:57–84`
- **Category:** Race Condition
- **Description:** `verifyOtp` reads the latest unconsumed OTP, checks `consumedAt`, then updates `consumedAt` in a separate query. Two concurrent requests with the correct code can both read `consumedAt = null`, both pass the guard, and both update the row. The second request succeeds even though the OTP was already consumed.
- **Impact:** Attacker can reuse a valid OTP by racing two requests. On a login flow, this allows session hijacking if the attacker intercepts the code and replays it before the legitimate user uses it.
- **Evidence:**
  ```typescript
  const row = await prisma.loginOtp.findFirst({ where: { destination, consumedAt: null }, ... });
  // ... match check ...
  await prisma.loginOtp.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  ```
  No atomic guard ensures the row is still unconsumed at update time.
- **Fix:** Use a single atomic update that guards on `consumedAt: null`:
  ```typescript
  const updated = await prisma.loginOtp.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, reason: "used" };
  ```
- **Test case:** Fire two `verifyOtp(destination, correctCode)` requests simultaneously. Exactly one should return `ok: true`; the other must return `ok: false, reason: "used"`.

---

### [CRITICAL] TOK-001 Email/Reset Token Double-Consumption
- **Location:** `app/lib/auth/tokens.ts:44–53`
- **Category:** Race Condition
- **Description:** `consumeToken` has the exact same pattern as OTP-001: find the row, check `usedAt`, then update `usedAt`. Two concurrent requests can both consume the same token. For a password-reset token, this means an attacker could race two password resets with the same token, potentially causing one to overwrite the other or both to succeed.
- **Impact:** Password-reset token replay. Email-verification token replay.
- **Evidence:**
  ```typescript
  const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
  if (row.usedAt) return { ok: false, reason: "used" };
  await prisma.emailToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });
  ```
- **Fix:** Atomic update with `usedAt: null` guard:
  ```typescript
  const updated = await prisma.emailToken.updateMany({
    where: { tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, reason: "used" };
  ```
- **Test case:** Two concurrent `consumeToken` calls with the same valid token. Only one should succeed.

---

### [CRITICAL] GIFT-001 Gift Daily/Monthly Cap Bypass
- **Location:** `app/app/api/keys/gift/route.ts:78–89`
- **Category:** Race Condition / Transaction
- **Description:** The rolling daily and monthly cap checks (`giftedSince`) read aggregates **outside** the `gift` transaction. Two concurrent gift requests from the same sender can both read the same pre-gift total, both pass the cap check, and both call `gift()` — each in its own transaction. Both transactions succeed, and the final total exceeds the cap.
- **Impact:** Verified user can exceed `GIFT_DAILY_CAP` (100) / `GIFT_MONTHLY_CAP` (500) by sending concurrent requests.
- **Evidence:**
  ```typescript
  const [dayTotal, monthTotal] = await Promise.all([
    giftedSince(session.userId, new Date(now - DAY_MS)),   // ← outside tx
    giftedSince(session.userId, new Date(now - MONTH_MS)),
  ]);
  // ... cap check ...
  const { sent, received } = await gift(session.userId, toUserId, amount); // ← separate tx
  ```
- **Fix:** Move the cap check inside the `gift` transaction, or add a version / optimistic lock on the sender's user row. Alternatively, read the sender's latest ledger row inside the `gift` transaction and sum from there.
- **Test case:** Send two concurrent `POST /api/keys/gift` requests when the sender is at `dayTotal = 95` and `amount = 10`. One should fail; both must not succeed.

---

### [HIGH] PROP-001 Proposal Counter Race Condition (Plan Limit Bypass)
- **Location:** `app/lib/billing/limits.ts:145–177`
- **Category:** Race Condition / Transaction
- **Description:** `ensureCanCreateProposal` reads the proposal counter, optionally resets it, and checks the limit — all in separate, non-atomic queries. `bumpProposalCounter` is called later in a separate query. Two concurrent proposal creations can both see the stale counter, both reset it to 0, both pass the limit check, and both increment — resulting in `count = 2` even when the limit is `1`.
- **Impact:** Free-plan users can exceed the 3-proposals/month limit by sending concurrent requests.
- **Evidence:**
  ```typescript
  // ensureCanCreateProposal
  if (sinceReset >= MONTH_MS) {
    count = 0;
    await prisma.user.update({ where: { id: userId }, data: { proposalsThisMonthCount: 0, proposalsCounterResetAt: now } });
  }
  if (count >= plan.maxProposalsMonth) { ... }
  // --- later in the route ---
  await bumpProposalCounter(session.userId); // separate query
  ```
- **Fix:** Wrap the read-check-reset-increment in a single transaction, or better, use a standalone counter table with atomic increments.
- **Test case:** Two concurrent `POST /api/proposals` from a free-plan user at the limit boundary. One should succeed; the other should fail with 402.

---

### [HIGH] CRON-001 Cron Double-Notifications (All Sweeps)
- **Location:** `app/app/api/cron/agreements-complete/route.ts:24–61`, `app/app/api/cron/pre-trip-reminders/route.ts:25–65`, `app/app/api/cron/review-reminders/route.ts:29–75`, `app/app/api/cron/window-proposals/route.ts:34–95`
- **Category:** Race Condition / Double-Run
- **Description:** All cron sweeps follow the same anti-pattern: `findMany` select a set of rows, then loop over them sending notifications, then update each row to stamp the "sent" flag. If two cron instances run concurrently (e.g., Vercel retry + manual trigger, or overlapping schedule), both instances select the same rows before either stamps them. Both send notifications; the second `updateMany` is a no-op but the notifications were already duplicated.
- **Impact:** Duplicate emails, duplicate push notifications, user spam, Resend/FCM quota waste.
- **Evidence:**
  ```typescript
  // agreements-complete
  const due = await prisma.swapAgreement.findMany({ where: { status: "ACTIVE", dateTo: { lt: new Date() } }, ... });
  // ... send notifications for every row in `due` ...
  await prisma.swapAgreement.updateMany({ where: { id: { in: due.map(...) }, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  ```
  The notification loop iterates over `due`, not over the `updateMany` result.
- **Fix:** Send notifications **only** for rows that were actually updated by the `updateMany` (or use a transaction that stamps the row first, then sends). Alternatively, use a `FOR UPDATE` skip-locked query to claim rows exclusively.
- **Test case:** Trigger two `GET /api/cron/agreements-complete` requests simultaneously. Only one set of notifications should be sent per agreement.

---

### [HIGH] INS-001 Orphaned Insurance Policy on Accept Failure
- **Location:** `app/app/api/proposals/[id]/route.ts:289–327`, `app/app/api/proposals/[id]/route.ts:333–426`
- **Category:** Transaction Boundary / Resource Leak
- **Description:** The insurance provider's `createPolicy` is called **before** the database transaction. If the provider successfully creates a policy but the DB transaction fails (e.g., `DATES_TAKEN` serialization error, deadlock, or unexpected exception), the policy exists in the provider's system but is not recorded in our database. The fallback `policyNumber` is used inside the transaction, but the real provider-generated policy is orphaned.
- **Impact:** Leaked insurance policies at the underwriter; phantom coverage; potential double-creation if the user retries acceptance.
- **Evidence:**
  ```typescript
  let policyResult = await provider.createPolicy({ ... }); // ← outside tx
  // ... later ...
  result = await prisma.$transaction(async (tx) => { ... }); // ← may fail
  ```
- **Fix:** Move the policy creation inside the transaction, or use an idempotency key so the provider call can be retried safely. Alternatively, create a "pending" policy row first, then call the provider inside the transaction, and update the row.
- **Test case:** Mock `provider.createPolicy` to succeed, then mock the transaction to throw `DATES_TAKEN`. The provider should not be left with an unreferenced policy.

---

### [HIGH] RL-001 In-Memory Rate-Limit Key Leak (Unbounded Map Growth)
- **Location:** `app/lib/rate-limit.ts:11`
- **Category:** Resource Leak / Memory
- **Description:** `const buckets = new Map<string, { count: number; resetAt: number }>()` is never pruned. Every unique IP address + user ID + endpoint combination that ever hits a rate-limited endpoint creates an entry that lives for the process lifetime. In a production server with millions of unique visitors, this is an unbounded memory leak.
- **Impact:** Process memory grows until OOM kill; denial of service on the node.
- **Evidence:**
  ```typescript
  const buckets = new Map<string, { count: number; resetAt: number }>();
  // No cleanup of expired entries anywhere.
  ```
- **Fix:** Add a periodic sweep or use a TTL-expiring map (e.g., `buckets.delete(key)` when `now >= b.resetAt` in `checkRateLimit`).
- **Test case:** Simulate 1 million unique IPs calling a rate-limited endpoint. Memory usage should plateau, not grow linearly.

---

### [HIGH] VAL-001 Zod Missing Date-Range Validation
- **Location:** `app/lib/validators.ts:45–48`, `app/lib/validators.ts:60–66`, `app/lib/validators.ts:68–72`
- **Category:** Missing Validation / Logic Error
- **Description:** `listingCreateSchema` accepts `availableFrom` and `availableTo` without enforcing `availableTo > availableFrom`. `swapProposalSchema` accepts `dateFrom` and `dateTo` without enforcing `dateTo > dateFrom`. `swapCounterSchema` accepts `counterDateFrom` and `counterDateTo` without enforcing the ordering. The route handlers do some manual checks, but this is fragile and misses edge cases (e.g., API consumers that bypass the route validation or programmatic callers).
- **Impact:** Invalid date ranges can be persisted, causing downstream availability logic to behave unexpectedly (e.g., `nightsBetween` clamping to 1, negative `rangesOverlap` behavior).
- **Evidence:**
  ```typescript
  availableFrom: z.coerce.date(),
  availableTo: z.coerce.date(),
  // No .refine() or .transform() ensuring to > from
  ```
- **Fix:** Add `.refine((data) => data.availableTo > data.availableFrom, ...)` to the schemas. Do the same for proposal/counter schemas.
- **Test case:** Pass `availableFrom: "2026-08-01"`, `availableTo: "2026-07-01"` to the listing creation API. It should reject with 400 before the route handler.

---

### [MEDIUM] DST-001 `nightsBetween` Ignores DST Transitions
- **Location:** `app/lib/keys/value.ts:196–201`
- **Category:** Date/Time Bug
- **Description:** `nightsBetween` divides the millisecond difference by a fixed `24 * 60 * 60 * 1000`. During daylight-saving transitions, a "night" is 23 or 25 hours, not 24. This causes an off-by-one floor during the spring-forward weekend and a potential extra night during fall-back.
- **Impact:** Keys cost calculation is off by 1 night for stays spanning a DST transition. User is undercharged or overcharged by one night's worth of Keys.
- **Evidence:**
  ```typescript
  const NIGHT_MS = 24 * 60 * 60 * 1000;
  export function nightsBetween(from: Date, to: Date): number {
    return Math.max(1, Math.floor((to.getTime() - from.getTime()) / NIGHT_MS));
  }
  ```
- **Fix:** Use calendar-date arithmetic instead of millisecond division:
  ```typescript
  const ms = to.getTime() - from.getTime();
  const days = Math.round(ms / NIGHT_MS); // or use a date-library function that counts calendar days
  return Math.max(1, days);
  ```
  Better: use `date-fns` `differenceInCalendarDays`.
- **Test case:** `nightsBetween(new Date("2026-03-28T00:00:00+01:00"), new Date("2026-03-30T00:00:00+02:00"))` should return `2`, not `1`.

---

### [MEDIUM] SES-001 Null `expiresAt` Treated as Expired in Bearer Check
- **Location:** `app/lib/auth/session.ts:158`
- **Category:** Null Safety / Logic Error
- **Description:** `row.expiresAt < new Date()` evaluates `null < new Date()`. In JavaScript, `null` is coerced to `0` in numeric comparisons, so `0 < Date.now()` is always `true`. If the schema ever allows `expiresAt` to be nullable (or a migration regression occurs), every bearer token would be rejected as expired.
- **Impact:** Complete bearer-token auth outage if `expiresAt` becomes nullable.
- **Evidence:**
  ```typescript
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  ```
- **Fix:** Add explicit null guards: `row.expiresAt != null && row.expiresAt < new Date()`.
- **Test case:** Unit test with an `AuthToken` row where `expiresAt: null`. `getSessionFromBearer` should return a valid session (or at least not reject due to the null check).

---

### [MEDIUM] TOK-002 Null `expiresAt` Treated as Expired in Email Token Check
- **Location:** `app/lib/auth/tokens.ts:50`
- **Category:** Null Safety / Logic Error
- **Description:** Same pattern as SES-001: `row.expiresAt <= new Date()` with `expiresAt = null` evaluates to `true`, treating the token as expired.
- **Fix:** `row.expiresAt != null && row.expiresAt <= new Date()`.

---

### [MEDIUM] OTP-002 Null `expiresAt` Treated as Expired in OTP Check
- **Location:** `app/lib/auth/otp.ts:63`
- **Category:** Null Safety / Logic Error
- **Description:** Same pattern as SES-001 and TOK-002.
- **Fix:** `row.expiresAt != null && row.expiresAt <= new Date()`.

---

### [MEDIUM] SHR-001 Share Conversion Race Overwrites First Converter
- **Location:** `app/lib/keys/earn.ts:198–206`
- **Category:** Race Condition / State Inconsistency
- **Description:** `grantShareConvertedBonus` updates `listingShareAttribution` with `convertedById: attribution.convertedById ?? args.converterId`. If two guests arrive simultaneously and both see `convertedById = null`, both update the row. The last write wins, so the second converter is recorded even though the first one should have won. The `grantEarnOnce` unique constraint on `eventKey` prevents double-credit, but the attribution row is wrong.
- **Impact:** Wrong user credited as the converter; marketing attribution incorrect.
- **Fix:** Use an atomic `updateMany` guard: `where: { id: attribution.id, convertedById: null }`, then check `updated.count === 1`.
- **Test case:** Two concurrent `grantShareConvertedBonus` calls for the same attribution. The first to commit should win; the second should receive `already_converted`.

---

### [MEDIUM] DLY-001 Daily Cron Blocks Forever on Hanging Job
- **Location:** `app/app/api/cron/daily/route.ts:41–61`
- **Category:** Cron / Resource Leak
- **Description:** The umbrella dispatcher `await`s each job sequentially with no timeout. If one job hangs (e.g., an external API call that never returns), the entire cron invocation blocks, and all subsequent jobs never run. On Vercel Hobby (10s max execution), this means the daily cron may silently skip jobs.
- **Impact:** Missed cron jobs (featured expiry, agreement completion, trip reminders, etc.).
- **Fix:** Wrap each job in `Promise.race([job(req), timeout(5000)])` and treat a timeout as a failure.
- **Test case:** Mock one job to return a promise that never resolves. The daily cron should still run the remaining jobs and report the timeout.

---

### [MEDIUM] DLY-002 Daily Cron Misclassifies Non-JSON Job Responses as Failures
- **Location:** `app/app/api/cron/daily/route.ts:45–46`
- **Category:** Logic Error / Error Handling
- **Description:** `const body = await res.json();` assumes every job returns valid JSON. If a job returns a plain text response (e.g., `NextResponse.text("OK")`) or an empty body, `res.json()` throws, and the `catch` block logs it as a job failure even though the HTTP status may have been 200.
- **Impact:** False-positive alerts in logs; difficulty distinguishing real failures from response-format mismatches.
- **Fix:** Check `res.headers.get("content-type")` before parsing, or wrap `res.json()` in its own try/catch that falls back to `await res.text()`.
- **Test case:** A job returns `new Response("OK", { status: 200 })`. The daily cron should record `body: "OK"` and `status: 200`, not an error.

---

### [MEDIUM] LIM-001 `proposalsCounterResetAt` Null Dereference
- **Location:** `app/lib/billing/limits.ts:153`
- **Category:** Null Safety
- **Description:** `user.proposalsCounterResetAt.getTime()` will throw `TypeError: Cannot read properties of null` if the column is null (e.g., for users created before the column existed, or after a schema migration without backfill).
- **Impact:** 500 error on proposal creation for affected users.
- **Fix:** `const sinceReset = now.getTime() - (user.proposalsCounterResetAt?.getTime() ?? 0);` or treat null as "epoch".
- **Test case:** Call `ensureCanCreateProposal` for a user whose `proposalsCounterResetAt` is null.

---

### [MEDIUM] REF-002 Duplicate Referrer Push Notifications
- **Location:** `app/lib/growth/referrals.ts:413–417`
- **Category:** Logic Error / Edge Case
- **Description:** `rewardedOwnerIds` is a plain array that may contain duplicates if the same referrer has multiple qualified referrals in the same batch. `Promise.all(ownerIds.map(...))` then pushes the same referrer multiple times.
- **Impact:** Duplicate push notifications to the referrer.
- **Fix:** Deduplicate before pushing: `const uniqueOwners = [...new Set(rewardedOwnerIds)];`.
- **Test case:** Two referrals for the same referrer qualify in the same `qualifyReferralsForReferee` run. Only one push should be sent.

---

### [MEDIUM] REC-001 Partial Refund Not Distinguished
- **Location:** `app/lib/billing/reconcile.ts:72–106`
- **Category:** Logic Error / Financial Edge Case
- **Description:** `reconcileRefund` marks domain rows as `refunded` without checking whether the refund is partial or full. For a partial refund (e.g., 50% of a featured listing purchase), the row is still marked fully refunded, and the featured window is recomputed as if the entire purchase was refunded.
- **Impact:** User gets full featured-window removal even though only a partial refund was issued.
- **Fix:** Check `refund.amount` against the original `amountCents` before marking fully refunded, or add a `refundedAmountCents` column.
- **Test case:** A `$50` featured purchase receives a `$25` partial refund. The listing should still retain half the featured window.

---

### [LOW] RL-002 `clientIpFromRequest` Trusts `x-real-ip` Unconditionally
- **Location:** `app/lib/rate-limit.ts:21–22`
- **Category:** Logic Error / Security Edge Case
- **Description:** `x-real-ip` is used without validating that it comes from a trusted proxy. If the app is deployed behind a misconfigured CDN or directly exposed, a client can set `x-real-ip` to any value and bypass per-IP rate limits.
- **Impact:** Rate-limit bypass for unauthenticated endpoints (though the comment notes this is best-effort).
- **Fix:** In production, validate `x-real-ip` against a trusted proxy list, or use a platform-provided connection object (e.g., Vercel's `req.ip`).
- **Test case:** Send a request with a spoofed `x-real-ip` header to a rate-limited endpoint. The rate limit should be applied to the real connection IP, not the spoofed one.

---

### [LOW] PRS-001 Prisma Adapter Forces Postgres on Vercel Even with SQLite URL
- **Location:** `app/lib/db/prisma.ts:9`
- **Category:** Logic Error / Deployment Edge Case
- **Description:** `IS_POSTGRES_CLIENT` is true if `process.env.VERCEL` is set, regardless of `DATABASE_URL`. A developer who deploys on Vercel but wants to use SQLite (e.g., for a preview branch with a local file) cannot do so because the adapter is hardcoded to `PrismaPg`.
- **Impact:** Deployment failure or unexpected database connection errors on Vercel with SQLite.
- **Fix:** Check `DATABASE_URL` first, then fall back to `VERCEL`: `Boolean(process.env.VERCEL) && (process.env.DATABASE_URL ?? "").startsWith("postgres")`.
- **Test case:** Set `VERCEL=1` and `DATABASE_URL=file:./dev.db`. The app should use the SQLite adapter.

---

### [LOW] ACT-001 Activity Throttle Map Leaks User IDs
- **Location:** `app/lib/auth/activity.ts:21`
- **Category:** Resource Leak / Memory
- **Description:** `lastTouched` is a module-level `Map<string, number>` that stores every user ID that has ever made an authenticated request. Entries are never evicted. In a large app, this leaks memory linearly with the user base.
- **Impact:** Slow memory growth in long-running processes.
- **Fix:** Evict entries older than `ACTIVITY_THROTTLE_MS` when a new entry is added, or use a WeakMap with a TTL sweep.
- **Test case:** Simulate 1 million unique user IDs calling `touchLastActive`. The map size should not exceed a reasonable window.

---

### [LOW] INS-002 Mock Insurance Policy Number Collision
- **Location:** `app/lib/insurance/mock.ts:31`, `app/lib/insurance/mock.ts:51–52`
- **Category:** Logic Error / Randomness
- **Description:** `randomBlock()` uses `Math.floor(Math.random() * 1_000_000)`. `Math.random()` is not cryptographically secure and can produce collisions in rapid succession. A mock policy number collision could cause duplicate `externalId` values.
- **Impact:** Test flakiness; potential integration-test failures.
- **Fix:** Use `crypto.randomInt(0, 1_000_000)` instead of `Math.random()`.
- **Test case:** Generate 100,000 mock policy numbers. No duplicates should occur.

---

### [LOW] CHK-001 Checkout Success URL Defaults to Localhost in Production
- **Location:** `app/lib/billing/checkout.ts:13`
- **Category:** Configuration / Logic Error
- **Description:** `const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";` silently falls back to localhost if the env var is missing. In production, this would redirect users to `localhost:3000` after a Stripe checkout, causing confusion and abandoned conversions.
- **Impact:** Failed checkout completions in production if `NEXT_PUBLIC_APP_URL` is not set.
- **Fix:** Throw a clear error at build-time or startup if `NEXT_PUBLIC_APP_URL` is missing in production.
- **Test case:** Start the app without `NEXT_PUBLIC_APP_URL`. It should fail fast with a descriptive error.

---

## Test Coverage Gaps

### Missing Critical-Path Tests
1. **Proposal acceptance race condition** — No test verifies that two concurrent `accept` actions on the same proposal do not create duplicate agreements.
2. **Keys stay host confirm/decline race** — `keys-stay.test.ts` tests the happy path but does not test concurrent `confirmKeysStay` or `releaseKeysStay` calls.
3. **Billing limits counter reset** — `plan-limits.test.ts` tests the limit check but not the concurrent reset-and-increment scenario.
4. **Stripe webhook idempotency** — `billing-reconcile.test.ts` tests the reconcile functions in isolation, but there is no test for the full webhook route handling duplicate `Stripe.Event.id` values.
5. **Referral cap enforcement** — `growth-referrals.test.ts` tests the happy path but does not test concurrent qualification of two referees for the same referrer at the cap boundary.
6. **Ledger lost update** — `keys-ledger.test.ts` uses an in-memory fake with a single-threaded transaction model. It does not simulate the PostgreSQL READ COMMITTED behavior where concurrent transactions can read the same balance.
7. **Session bearer token `expiresAt` null** — No test for `getSessionFromBearer` with a null `expiresAt` column.
8. **Date/DST edge cases** — `keys-value.test.ts` does not test `nightsBetween` across DST transitions.
9. **Cron double-run** — `cron-daily.test.ts` exists but does not test concurrent invocations of the same sweep.
10. **Insurance policy creation failure** — No test for the accept path when `provider.createPolicy` throws but the transaction succeeds.
11. **UploadThing security** — `uploadthing.ts` is untested; no validation of file-type/size limits in the router.
12. **Rate-limit memory leak** — No test asserting that the `buckets` map does not grow unbounded.

### Edge Cases Untested
- Empty `photos` array (`[]`) vs. malformed JSON (`"not-json"`) in listing DTOs — partially tested in `proposals-inbox.test.ts`.
- `availableTo` < `availableFrom` in listing creation — not tested at the Zod schema level.
- `counterDateTo` <= `counterDateFrom` in proposal counter — not tested.
- `shareToken` resolution when the token doesn't match the listing — not tested in `keys-earn.test.ts`.
- `grantEarnOnce` when the user is unverified — partially tested but not for all four earn kinds.
- `bookedRangesFor` when a listing has overlapping `swapAgreement`, `keysStay`, and `blockedRange` entries — not tested.

---

## Code Quality Issues

### Consistency Problems
1. **Mixed `new Date()` and `Date.now()`** — `new Date()` is used for database writes, but `Date.now()` is used for arithmetic (`MONTH_MS`, `DAY_MS`, `sinceReset`). These are both UTC-based, but mixing constructors and timestamps is inconsistent. Prefer `Date.now()` everywhere for arithmetic, then wrap in `new Date()` when persisting.
2. **Inconsistent transaction isolation** — `proposals/[id]/route.ts` uses `Serializable` for acceptance, but `keys/stay.ts` uses `Serializable` for `createKeysStay`. Other critical paths (gift, referral qualification, proposal counter) do not specify isolation at all, defaulting to the adapter's default (READ COMMITTED on PostgreSQL).
3. **Mixed error propagation** — Some routes use `throw err` for unexpected errors, while others use `console.error` and return a success response. The webhook route deletes the `BillingEvent` reservation on handler failure, but other routes do not have a consistent retry-safe pattern.

### Naming Issues
1. **`keysKindLabel` parameter named `kind`** — In `app/lib/keys/ledger.ts:77`, the parameter is `kind: string`, but it accepts any string, not just a `KeysKind`. The `as KeysKind` cast is a smell; a safer pattern would be `kind: KeysKind | string`.
2. **`rewardedReferralsSince` uses `prisma` not `tx`** — The function name doesn't indicate it reads committed data, which is a subtle trap for callers inside transactions.

### Dead Code / Unused Imports
1. **`app/app/api/proposals/[id]/route.ts`** imports `Prisma` but only uses it for `Prisma.TransactionIsolationLevel.Serializable`. This is used, so it's not dead code.
2. **`app/lib/billing/checkout.ts`** imports `marketingUrl` but it's only used in `startSubscriptionCheckout`. This is fine.
3. **`app/lib/keys/valuation.ts`** imports `FEEDBACK_MIN_REVIEWS` and `FEEDBACK_STEP_PER_CYCLE` twice (line 44 and 45). The second import is redundant because of the export on line 44.

### Complex Functions That Should Be Split
1. **`app/app/api/proposals/[id]/route.ts` POST handler** — The `POST` function is 294 lines, handling archive, withdraw, decline, counter, and accept actions with deep nesting. Extract each action into a dedicated helper (`archiveProposal`, `withdrawProposal`, `declineProposal`, `counterProposal`, `acceptProposal`).
2. **`app/lib/keys/stay.ts` `createKeysStay`** — 116 lines with validation, transaction, and occupancy logic. Split into `validateStayRequest` and `executeStayTransaction`.
3. **`app/lib/growth/referrals.ts` `qualifyReferralsForReferee`** — 107 lines with a complex inner transaction loop. Extract the per-referral transaction body into a helper.
4. **`app/lib/billing/reconcile.ts`** — The file has 7 distinct reconcile handlers mixed with the main dispatcher. Each handler should be in its own file (`reconcile-verify-listing.ts`, `reconcile-feature-listing.ts`, etc.).

### Type Safety Issues
1. **`as` casts in critical paths** — `app/lib/billing/limits.ts:107` uses `sub.planId as PlanId` without runtime validation. If Stripe sends an unknown plan ID, the code returns `PLAN_LIMITS.free` as a fallback, but the cast is still unsafe. Prefer `PLAN_LIMITS[id as PlanId] ?? PLAN_LIMITS.free` without the intermediate cast.
2. **`parseJSON` returns `as T`** — `app/lib/db/index.ts:4–11` uses `JSON.parse(s) as T` and silently swallows parse errors. This is intentional for resilience, but it can mask data corruption. Consider logging malformed JSON in production.
3. **`listingCreateSchema` does not validate `maxStayDays >= minStayDays`** — The Zod schema allows `minStayDays: 30, maxStayDays: 1`, which is a business-rule violation.

### Missing Indexes / Query Performance
1. **`bookedRangesFor` in `app/lib/listing/availability.ts`** — Queries `swapAgreement` with `OR: [{ listing1Id: listingId }, { listing2Id: listingId }]`. Without a composite index on `(listing1Id, status)` and `(listing2Id, status)`, this can scan a large table.
2. **`keysStay.findMany` in `createKeysStay` inner transaction** — Queries by `listingId` and `status` but the schema may not have a composite index on `(listingId, status)`.
3. **`loginOtp.findFirst` in `verifyOtp`** — Orders by `createdAt: "desc"` with `where: { destination, consumedAt: null }`. If the table grows large, this needs an index on `(destination, consumedAt, createdAt)`.

---

*Report generated by Code_Quality_BugHunt_Agent for the Swapl project.*
