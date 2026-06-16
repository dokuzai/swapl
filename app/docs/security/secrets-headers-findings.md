# Pentest — Secrets / Info Disclosure / Headers / Rate-Limiting / Enumeration

Target: swapl web app (`app/`), localhost:3000 with seeded data. Authorized internal pentest.
Date: 2026-06-16. Auth used: `sim+b1-00000@sim.swapl` / `swapl-demo`.

Surface scoped: secrets leakage, info disclosure, security headers, CORS, rate-limiting,
account enumeration, Accept-Language (DOK-191), CSRF.

## Severity summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Login rate-limit bypass via spoofed `X-Forwarded-For` + no per-account lockout | **High** | CONFIRMED |
| 2 | Account enumeration via `POST /api/auth/register` (409 "Email already in use") | Medium | CONFIRMED |
| 3 | Hardcoded `SESSION_SECRET` fallback (session forgery if env unset) | Medium | CONFIRMED |
| 4 | Weak / partial Content-Security-Policy (only `frame-ancestors`) | Medium | CONFIRMED |
| 5 | No CSRF token / Origin validation (relies solely on SameSite=Lax) | Medium (SUSPECTED exploit) | CONFIRMED (control gap) |
| 6 | AI cost endpoints use in-memory (non-durable) per-user limiter | Low–Medium | CONFIRMED |
| 7 | Missing `Permissions-Policy`; `X-Powered-By: Next.js` exposed | Low | CONFIRMED |
| 8 | Session cookie payload is unencrypted (signed-only) base64 JSON | Low (info) | CONFIRMED |
| 9 | `/api/admin/email-test` leaks `RESEND_API_KEY` presence (admin-only) | Info | CONFIRMED |

## Clean (verified NOT vulnerable)

- `User.aiApiKey` is never returned: `/api/ai/settings` GET returns only `hasKey: boolean`; `/api/me` and `/api/profiles/[id]` do not select it. (`app/api/ai/settings/route.ts:14-27`)
- `.env`, `.env.production.local` are git-untracked and return **404** over HTTP.
- No client browser source maps served (`/_next/static/**/*.map` → 404). Server `.next/server/*.map` are not web-exposed.
- No permissive CORS: API does not reflect `Access-Control-Allow-Origin`; forged `Origin` is ignored, no `*`-with-credentials.
- No stack traces / Prisma schema leakage: malformed input → generic 400 `{"error":"Invalid input"}`, missing IDs → 404 `{"error":"Not found"}`.
- Login & forgot-password are enumeration-safe (uniform messages / always 200).
- OTP has a proper per-code 5-attempt lockout (`lib/auth/otp.ts:64-78`) and dual per-destination + per-IP request limits (`app/api/auth/otp/request/route.ts:37-43`).
- **DOK-191 Accept-Language is safe**: `detectLocaleFromHeader` resolves against the `LOCALES` allowlist (`lib/i18n/locales.ts`), the locale cookie is `isLocale`-validated, and the value is never reflected into a response header or HTML — no header injection / cache poisoning.

---

## 1. Login brute-force: rate-limit bypass + no account lockout — HIGH

**OWASP:** A07:2021 Identification & Authentication Failures (CWE-307).
**Files:** `lib/rate-limit.ts:17-23` (`clientIpFromRequest`), `app/api/auth/login/route.ts:14-19`.

The login limiter keys on `clientIpFromRequest()`, which returns `x-forwarded-for.split(",")[0]` — the
**leftmost, client-controlled** value. Rotating that header gives each request a fresh bucket. There is
also **no per-account lockout** — only the per-IP counter gates password guesses.

On Vercel this still works: the platform appends to XFF but the code reads index 0, which the attacker sets.

**Reproduction (CONFIRMED):**
```
# Rotating X-Forwarded-For — 40 wrong-password attempts, NONE blocked:
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " -X POST \
  http://localhost:3000/api/auth/login -H "X-Forwarded-For: 172.16.0.$i" \
  -H "Content-Type: application/json" \
  -d '{"email":"sim+b1-00000@sim.swapl","password":"wrongpass123"}'; done
# => 401 x40, 429 x0   (rate-limit fully bypassed)

# Fixed IP for comparison — limiter does fire:
# => 401 x30, 429 x10  (30/5min works only when IP can't be spoofed)
```
No 429 across 40 attempts with rotation; with a fixed IP, 30 allowed then 429. Confirms the gate is the
spoofable XFF and nothing else (no lockout, no exponential backoff, no CAPTCHA on login).

**Fix:**
- Derive client IP from a trusted source. On Vercel use `request.headers.get("x-vercel-forwarded-for")` /
  the platform-verified IP, or take the *rightmost* untrusted-boundary hop, not index 0.
- Add a per-account failure counter (e.g. lock/slow after N fails on a given email within a window) in
  addition to the per-IP limit.
- Move login onto the durable limiter (`checkRateLimitDurable`) so it holds across serverless instances.
- Consider Turnstile on login after K failures (already wired for register).

## 2. Account enumeration via register — MEDIUM

**OWASP:** A07:2021 (CWE-204).
**File:** `app/api/auth/register/route.ts:44-47`.

```
curl -s -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"sim+b1-00000@sim.swapl","password":"swapl-demo123"}'
# => {"error":"Email already in use"}   (409)  — vs a clean email which proceeds
```
A registered email returns 409 with a distinct body; an unused one proceeds. An attacker can confirm which
emails have swapl accounts. (Login and forgot-password were checked and are correctly uniform.)

**Fix:** On a duplicate email, return the same generic success/"check your inbox" response as a fresh
signup and email the existing user a "you already have an account" notice instead of signalling via HTTP
status/body. (Trade-off vs UX — at minimum align with the enumeration-safe pattern already used by
forgot-password in this codebase.)

## 3. Hardcoded SESSION_SECRET fallback — MEDIUM

**OWASP:** A02:2021 Cryptographic Failures / A05 Misconfiguration (CWE-798).
**File:** `lib/auth/session.ts:15`.

```js
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-please-change-this-to-32-random-bytes-minimum";
```
If `SESSION_SECRET` is ever unset in an environment, the HMAC key is a **public constant from the repo**,
letting anyone forge a `swapl_session` cookie for any `userId` → full account takeover. Currently set in
`.env` locally, but there is no fail-closed guard. Same risk applies anywhere `NEXTAUTH_SECRET` defaults.

**Fix:** Remove the fallback; throw on boot if `SESSION_SECRET` is missing or shorter than 32 bytes
(`if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET required")`). Fail closed in production.

## 4. Weak Content-Security-Policy — MEDIUM

**OWASP:** A05:2021 Security Misconfiguration.
**File:** `next.config.ts:22-28`.

The only CSP directive is `frame-ancestors 'none'`. There is **no `default-src` / `script-src` /
`object-src` / `base-uri` / `form-action`**, so the policy provides clickjacking protection but **zero XSS
mitigation**. Confirmed live on `/` and all API responses: `Content-Security-Policy: frame-ancestors 'none'`.

**Fix:** Add a real script policy. With Next 16, prefer a nonce-based CSP via middleware:
`default-src 'self'; script-src 'self' 'nonce-<n>'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
Add `frame-src`/`connect-src` for Stripe/Mapbox/UploadThing as needed.

## 5. No CSRF token / Origin check — MEDIUM (control gap; exploit SUSPECTED)

**OWASP:** A01:2021 Broken Access Control (CWE-352).
**Files:** all state-changing routes; `lib/auth/session.ts:69-78` (cookie attrs). No `csrf` / `Origin` /
`Referer` / `Sec-Fetch-Site` validation exists anywhere (grep returned nothing).

The session cookie is `SameSite=Lax`, which blocks cross-site cookie attachment on non-GET requests — so a
classic CSRF form POST is mitigated **today**. But there is no defense in depth:
- No CSRF token, no Origin/Referer allowlist. The server happily accepts a state change with a forged
  `Origin`. CONFIRMED:
  ```
  curl -s -i -X PATCH http://localhost:3000/api/profile -b cookies.jar \
    -H "Origin: https://evil.example" -H "Content-Type: application/json" \
    -d '{"bio":"csrf-pwn"}'      # => HTTP/1.1 200 OK  (Origin ignored)
  ```
- `proposals/[id]` accept/decline/withdraw is a `POST` with a JSON body (`app/api/proposals/[id]/route.ts`).
  Any future CORS relaxation, a `text/plain`/simple-request body parser, or a SameSite downgrade would make
  the swap accept/decline flow CSRF-exploitable.

**Fix:** Add an Origin/Referer allowlist check (or `Sec-Fetch-Site: same-origin`) as a shared guard for all
mutating handlers, and/or a double-submit CSRF token. Keep `SameSite=Lax` (consider `Strict` for the
session cookie).

## 6. AI endpoints use non-durable in-memory limiter — LOW–MEDIUM (cost abuse)

**OWASP:** A04:2021 Insecure Design.
**Files:** `app/api/ai/suggestions/route.ts:5,11` (`checkRateLimit` 20/min/user), and the other
`app/api/ai/*` routes. All are auth-gated and per-user keyed (good), but use the **in-memory**
`checkRateLimit`, which the module header itself notes is "NOT safe across serverless invocations." On
Vercel each instance has its own bucket, so the effective per-user AI budget multiplies by instance count —
real LLM-cost abuse vector.

**Fix:** Switch the AI routes to `checkRateLimitDurable` (Upstash) so the per-user budget is global. Consider
a per-user daily cap and a global circuit breaker on spend.

## 7. Missing Permissions-Policy; X-Powered-By exposed — LOW

**OWASP:** A05:2021.
**File:** `next.config.ts:22-28` (`SECURITY_HEADERS`).

- No `Permissions-Policy` header — browser features (geolocation, camera, etc.) are not locked down.
- `X-Powered-By: Next.js` is returned on page responses (confirmed on `/`), disclosing the framework.

**Fix:** Add `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(self)` (tune to
needs) to `SECURITY_HEADERS`, and set `poweredByHeader: false` in `next.config.ts`.

## 8. Session cookie is signed-but-not-encrypted — LOW (info disclosure)

**File:** `lib/auth/session.ts:32-36`.

The cookie body is `base64url(JSON)` + HMAC. It is integrity-protected but **readable**:
```
echo eyJ1c2VySWQiOiJzaW0tYjEtdS0wMDAwMCIs... | base64 -d
# => {"userId":"sim-b1-u-00000","email":"sim+b1-00000@sim.swapl","name":"Anna Tanaka"}
```
`HttpOnly` keeps JS from reading it, so impact is limited (the email/name are already known to the holder),
but any cookie exfil (e.g. via the missing CSP in #4) discloses the email and internal userId. The code
comment already flags "switch to iron-session before launch."

**Fix:** Use an encrypted session (iron-session / JWE) or store only an opaque session id server-side.

## 9. admin/email-test leaks RESEND_API_KEY presence — INFO

**File:** `app/api/admin/email-test/route.ts:21,30`. Admin-gated (`requireAdmin`), but the response body
`{ ok, using: "resend" | "console-log" }` reveals whether `RESEND_API_KEY` is configured. Low risk given
admin-only; noted for completeness.

---

## Notes / methodology
- All HTTP probes run against the live seeded dev server on localhost:3000.
- "CONFIRMED" = reproduced live or by direct code path; "SUSPECTED" = plausible but not exploited in this run.
- IP-spoofing finding (#1) applies to production: `clientIpFromRequest` reads `x-forwarded-for[0]`, which is
  client-controlled at the edge.
