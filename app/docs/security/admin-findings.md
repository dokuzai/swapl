# Pentest: Admin Routes & Privilege Escalation

Authorized internal pentest of swapl (pre-launch). Surface: `app/app/api/admin/*`,
`app/app/api/cron/*`, and role/verification escalation vectors. Target: running dev
server at `http://localhost:3000` with seeded data.

- **Non-admin account:** `sim+b1-00000@sim.swapl` / `swapl-demo` → `sim-b1-u-00000`, role `member`
- **Admin account (reference only):** `gert@dokuz.ai` / `swapl-demo`, role `swapl_admin`
- Date: 2026-06-16

## Summary

| Area | Result |
|------|--------|
| Admin route authorization (all GET + mutating verbs) | **PASS** — server-side `swapl_admin` gate, uniform 401/403 for non-admin |
| Role escalation via `/api/profile`, `/api/auth/register` | **PASS** — privileged fields not mass-assignable (zod allowlist) |
| Self-approve identity verification | **PASS** — only via HMAC-signed Didit webhook / provider-confirmed poll |
| Self-approve property (owner) verification | **PASS** (by config) — auto-approve behind off-by-default flag; AI judges doc, only flips a listing badge, never user role/verified |
| **Cron endpoint authorization** | **FAIL (CONFIRMED)** — every `/api/cron/*` callable with **no auth** in this environment |

One confirmed finding (cron auth), and one low-severity hardening note (cron fail-open
design). All admin routes and escalation vectors are correctly secured server-side.

---

## FINDING 1 — Cron endpoints are unauthenticated and openly callable — CONFIRMED

- **Severity:** High (in any non-`production` `NODE_ENV` deployment, including staging/preview); Medium overall because the fail-open is `NODE_ENV`-gated.
- **OWASP:** A01:2021 Broken Access Control (also A05 Security Misconfiguration — fail-open default).
- **Status:** CONFIRMED on the running dev server.

### What

Every cron route is gated by `isAuthorizedCron(req)` (`app/lib/auth/cron.ts:7`). When
`CRON_SECRET` is **unset**, the helper returns `true` for any request whenever
`NODE_ENV !== "production"`:

```
app/lib/auth/cron.ts:7
  export function isAuthorizedCron(req: Request): boolean {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      // No secret configured: only allow in development ...
      return process.env.NODE_ENV !== "production";   // <-- fail-open
    }
    const auth = req.headers.get("authorization") ?? "";
    return auth === `Bearer ${expected}`;
  }
```

`CRON_SECRET` is not present in any `.env*` file in `app/`. So in this environment
(and any deployed environment whose `NODE_ENV` is not exactly `"production"` — e.g. a
Vercel/Render **preview** or **staging** build, or a misconfigured deploy), the secret
check is bypassed entirely and **anyone on the network can trigger every cron job with
no credentials.**

These jobs have real side effects: `daily` fans out to all others;
`agreements-complete` completes swap agreements (which grants Keys via the earn hooks);
`featured-expire` expires featured placements; `saved-searches`, `trip-nudges`,
`review-reminders`, `pre-trip-reminders`, `window-proposals` send emails / push.
Unauthenticated invocation is abusable for spam (email/push amplification), premature
state transitions, and Key-economy manipulation.

### Reproduction (no auth, no cookie)

```
$ for c in daily featured-expire agreements-complete saved-searches trip-nudges \
           review-reminders pre-trip-reminders window-proposals listing-valuation; do
    curl -s -o /dev/null -w "%{http_code}  /api/cron/$c\n" http://localhost:3000/api/cron/$c
  done
200  /api/cron/daily
200  /api/cron/featured-expire
200  /api/cron/agreements-complete
200  /api/cron/saved-searches
200  /api/cron/trip-nudges
200  /api/cron/review-reminders
200  /api/cron/pre-trip-reminders
200  /api/cron/window-proposals
200  /api/cron/listing-valuation

$ curl -s http://localhost:3000/api/cron/agreements-complete
{"ok":true,"completed":0}

$ curl -s http://localhost:3000/api/cron/daily
{"ok":true,"results":{"featured-expire":{"ok":true,"expired":0},"saved-searches":{...},
 "agreements-complete":{"ok":true,"completed":0}, ... }}
```

(Counts are 0 only because no seeded records are *due* right now; the handlers run to
completion and would act on any due rows.)

### Affected files

- `app/lib/auth/cron.ts:9-12` (fail-open branch)
- All routes wired correctly to the helper but inheriting its weakness:
  `app/app/api/cron/daily/route.ts:35`, `featured-expire/route.ts:12`,
  `agreements-complete/route.ts:20`, `saved-searches/route.ts:19`,
  `trip-nudges/route.ts:24`, `review-reminders/route.ts:25`,
  `pre-trip-reminders/route.ts:20`, `window-proposals/route.ts:28`,
  `listing-valuation/route.ts:32`

### Server-side fix

1. **Require the secret to be configured; fail closed when it is missing**, regardless
   of `NODE_ENV`. Do not key the bypass on `NODE_ENV !== "production"` — preview/staging
   builds are not `production` and are network-reachable.

   ```ts
   // app/lib/auth/cron.ts
   export function isAuthorizedCron(req: Request): boolean {
     const expected = process.env.CRON_SECRET;
     if (!expected) {
       // Fail closed. Allow ONLY when explicitly opted in for local dev.
       return process.env.ALLOW_INSECURE_CRON === "1";
     }
     const auth = req.headers.get("authorization") ?? "";
     // constant-time compare to avoid timing oracles on the secret
     return safeEqual(auth, `Bearer ${expected}`);
   }
   ```

2. **Set `CRON_SECRET` in every deployed environment** (Vercel Cron sends
   `Authorization: Bearer ${CRON_SECRET}` automatically) and in `.env.local` for local
   work, so the open path is never taken on a real host.
3. Use a constant-time comparison (`crypto.timingSafeEqual`) for the bearer check.

---

## FINDING 2 — `isAuthorizedCron` uses non-constant-time string compare — LOW / hardening

- **Severity:** Low.
- **OWASP:** A02:2021 Cryptographic Failures (timing side channel).
- **Status:** CONFIRMED (code review).

`app/lib/auth/cron.ts:15` compares the bearer with `===`, which can leak the secret
byte-by-byte under a precise timing oracle. Use `crypto.timingSafeEqual`. Bundled into
Finding 1's fix above.

---

## Verified-SECURE controls (no vuln)

### Admin route authorization — server-side, uniform — PASS

All `/api/admin/*` routes enforce the `swapl_admin` role **server-side** via
`requireAdmin()` / `requireAdminFromRequest()` (`app/lib/auth/abilities.ts:44,54`), and
the gate runs **before** any body parsing or DB work. Coverage confirmed by code review
of every route and by live probing as the non-admin sim user.

Live results as `sim-b1-u-00000` (member), authenticated cookie:

```
403 GET  /api/admin/metrics                      {"error":"FORBIDDEN"}
401 GET  /api/admin/disputes                     {"error":"UNAUTHENTICATED"}
401 GET  /api/admin/property-verifications       {"error":"UNAUTHENTICATED"}
403 GET  /api/admin/signups/export               {"error":"FORBIDDEN"}
403 POST /api/admin/users/{id}   {"action":"suspend"}    {"error":"FORBIDDEN"}
403 POST /api/admin/email-test                   {"error":"FORBIDDEN"}
403 POST /api/admin/signups/invite               {"error":"FORBIDDEN"}
403 POST /api/admin/listings/{id}                {"error":"FORBIDDEN"}
403 POST /api/admin/verifications/{id}           {"error":"FORBIDDEN"}
403 POST /api/admin/property-verifications/{id}  {"error":"FORBIDDEN"}
403 POST /api/admin/reviews/{id}                 {"error":"FORBIDDEN"}
403 POST /api/admin/reports/{id}                 {"error":"FORBIDDEN"}
403 POST /api/admin/disputes/{id}                {"error":"FORBIDDEN"}
```

The same routes return 200 only for the real `swapl_admin` (confirmed:
`GET /api/admin/metrics` → 200 with the metrics payload; `GET /api/admin/signups/export`
→ 200 CSV). The 401-vs-403 split is just two error-mapping styles
(`requireAdminFromRequest` distinguishes UNAUTHENTICATED from FORBIDDEN); both deny
access. Gate guard per route confirmed present:

| Route | Guard | file:line |
|-------|-------|-----------|
| admin/metrics (GET) | requireAdminFromRequest | `metrics/route.ts:16` |
| admin/disputes (GET) | requireAdminFromRequest | `disputes/route.ts:18` |
| admin/disputes/[id] (POST) | requireAdminFromRequest | `disputes/[id]/route.ts:26` |
| admin/email-test (POST) | requireAdmin | `email-test/route.ts:13` |
| admin/property-verifications (GET) | requireAdminFromRequest | `property-verifications/route.ts:13` |
| admin/property-verifications/[id] (POST) | requireAdminFromRequest | `property-verifications/[id]/route.ts:23` |
| admin/listings/[id] (POST) | requireAdmin | `listings/[id]/route.ts:13` |
| admin/verifications/[id] (POST) | requireAdmin | `verifications/[id]/route.ts:13` |
| admin/users/[id] (POST) | requireAdmin | `users/[id]/route.ts:14` |
| admin/signups/invite (POST) | requireAdmin | `signups/invite/route.ts:22` |
| admin/signups/export (GET) | requireAdmin | `signups/export/route.ts:18` |
| admin/reports/[id] (POST) | requireAdmin | `reports/[id]/route.ts:17` |
| admin/reviews/[id] (POST) | requireAdminFromRequest | `reviews/[id]/route.ts:16` |

No admin route is missing the check.

### Role / verification mass-assignment — PASS

- `PATCH /api/profile` uses a zod allowlist schema with no `role`/`verified`/`isVerified`
  field (`app/app/api/profile/route.ts:11-22`); the update only spreads the parsed,
  allowlisted keys. Live test injecting those keys returned 200 but the values were
  stripped; `GET /api/me` afterward still shows `role:"member"`:

  ```
  $ curl -b sim -X PATCH /api/profile \
      -d '{"name":"Anna","role":"swapl_admin","verified":true,"isVerified":true}'
  200 {"profile":{...}}
  $ curl -b sim /api/me   ->  ...,"role":"member",...    # unchanged
  ```
  (The user's `verified:true` was pre-set in seed data, not by this request — the schema
  has no `verified` field to write.)
- `POST /api/auth/register` (`app/app/api/auth/register/route.ts:50-52`) creates the user
  with only `{ email, passwordHash, name }`; `role` is never taken from input.

### Identity verification self-approval — PASS

User `verified` is flipped only by `applyVerificationUpdate(...)`, reachable through:
- `POST /api/webhooks/didit` (`app/app/api/webhooks/didit/route.ts:54`) — gated by HMAC
  signature (`X-Signature` HMAC-SHA256 of the raw body) + a 5-minute replay window;
  503 when `DIDIT_WEBHOOK_SECRET` is unset, so it cannot be forged.
- `POST /api/verification/session` / status poll — the status comes from Didit
  (`getSessionStatus`), not from the client. A user cannot post `status:"approved"`.

### Property (owner) verification self-approval — PASS (config-dependent)

`POST /api/listings/[id]/property-verification` can auto-set a listing's `ownerVerified`
badge, but only when `PROPERTY_AI_AUTO_APPROVE_OWNER === "1"` (off by default —
`app/lib/listing/property-eligibility.ts:21,97`) AND the AI classifies the
**user-supplied document** as a high-confidence private owner. It affects a per-listing
badge only — never the user's `role` or account-level `verified`. Recommend keeping the
flag off in production; if enabled, ensure document URLs are restricted to the platform's
own upload bucket (they go through `/api/uploads/...`) so an attacker can't point the AI
at an arbitrary forged-but-convincing document host. Not a vuln in the current default
config.

---

## Reproduction environment

- Login: `POST /api/auth/login` with the sim creds returned `swapl_session` cookie for
  `sim-b1-u-00000` (role member, per `/api/me`).
- All probes used that cookie. Non-destructive: mutating calls targeted non-existent IDs
  (`abc`) or were rejected at the gate before touching data; no real records were
  suspended/moderated. Cron calls executed but acted on 0 due rows.

## Priority

1. **Fix Finding 1** before any non-production deploy is exposed: fail `isAuthorizedCron`
   closed and set `CRON_SECRET` everywhere. This is the only real access-control gap.
2. Roll the constant-time compare (Finding 2) into the same change.
