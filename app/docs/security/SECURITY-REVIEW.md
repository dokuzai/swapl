# swapl — Security Review & Pentest (2026-06-16)

Authorized pre-launch pentest of the team's own app. Six parallel agents probed
distinct attack surfaces against the running app (`localhost:3000`, seeded data),
combining code review with **live exploitation** (real cross-user / unauth requests).
Per-surface detail: `idor-findings.md`, `auth-findings.md`, `admin-findings.md`,
`economy-findings.md`, `injection-findings.md`, `secrets-headers-findings.md`.

## Headline

**The founder's core requirement is satisfied: authorization is enforced
SERVER-SIDE, not client-side.** Broken-access-control testing found **0** vulns —
every owned resource (listings, proposals, conversations, agreements, trips,
reviews, disputes, profile, settings, keys) re-checks ownership/role on the server,
on read AND write, for both the web cookie and the mobile bearer token. Identity is
always session-derived; mass-assignment of `userId`/`role`/`verified`/`nightlyKeys`
is stripped (Zod allowlists). Admin routes enforce `swapl_admin` server-side.

The real issues were in **secret/credential handling and rate-limiting**, not access control.

## Findings & status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| C1 | **Critical** | Session cookie forgeable: hardcoded fallback `SESSION_SECRET` in source + prod `SESSION_SECRET=""` (`"" ?? fallback` keeps the empty key) + no fail-closed + sessions never expire. Reproduced: forged a cookie for a user never logged into → full `/api/me`; forging the admin's userId = admin session. | **Fixed (code)** + ops action |
| H1 | High | `/api/cron/*` fail **open** when `CRON_SECRET` unset and `NODE_ENV !== production` → unauth execution of Keys-granting / agreement-completing / mail jobs. Reproduced 200 unauth. | **Fixed** (now 403 unauth, verified) + ops action |
| H2 | High | Login brute-force: per-IP limit keyed on spoofable `x-forwarded-for[0]`; no per-account lockout. Reproduced 40/40 wrong passwords by rotating the header. | **Fixed** (per-account durable lockout + x-real-ip/rightmost-XFF) |
| H3 | High | SSRF: property-verification fetches a user-supplied document URL (`lib/ai/property-doc.ts`) validated only as `url()`; no host/IP allowlist. Live only when `AI_PROVIDER=anthropic`. | **Fixed** (UploadThing-host allowlist + `redirect:"error"`) |
| M1 | Medium | Featured placement granted free via the Stripe-unconfigured `pre_launch` branch. | Ops action (set Stripe envs) — see below |
| M2 | Medium | Register reveals account existence (409 "Email already in use"); login & forgot-password are uniform. | Deferred (tracked) |
| M3 | Medium | Weak CSP — only `frame-ancestors 'none'`, no `script-src`/`default-src`. | Deferred (needs nonce wiring) |
| M4 | Medium | No CSRF token / Origin check; relies solely on `SameSite=Lax`. | Deferred (tracked) |
| L1 | Low | Photo upload allowed `image/svg+xml` (prefix match). | **Fixed** (raster allowlist, SVG rejected) |
| L2 | Low | Missing `Permissions-Policy`; `X-Powered-By` exposed. | **Fixed** (header added + `poweredByHeader:false`) |
| L3 | Low | Cron bearer compared with `===` (timing). | **Fixed** (`timingSafeEqual`) |
| L4 | Low | Paid verification free via `pre_launch` branch (but grants no badge; admin still approves). | Ops action (Stripe envs) |

## Verified SOUND (no action) — notable
- **IDOR / broken access control: clean across the board** (the primary concern).
- Admin role gating server-side; mass-assignment stripped; identity `verified` only via signed Didit webhook.
- Stripe & Didit webhooks verify signatures (forged self-upgrade rejected); Keys ledger / plan limits / valuation are server-authoritative; Keys-stay replay defeated; DOK-160 private-room coefficient not abusable.
- No SQL/NoSQL injection (allowlisted filters, no raw queries); XSS safe (React escaping; the one `dangerouslySetInnerHTML` uses `escapeXml`); no prototype pollution; affiliate redirector uses hardcoded hosts.
- `User.aiApiKey` never leaves the server; `.env*` git-untracked + 404 over HTTP; no permissive CORS; no stack-trace/Prisma leakage; OTP/reset/verify tokens are strong, hashed, single-use, expiring; DOK-191 `Accept-Language` is allowlisted and never reflected.

## Fixes applied in this commit
- `lib/auth/session.ts` — fail closed in production if `SESSION_SECRET` missing/`<32` chars (no more silent hardcoded/empty key); added a signed `exp` (30d) checked on decode (legacy cookies grandfathered).
- `lib/auth/cron.ts` — fail closed: require `CRON_SECRET`; only bypass with explicit `ALLOW_INSECURE_CRON=1` outside production; `timingSafeEqual` compare.
- `lib/rate-limit.ts` + `app/api/auth/login/route.ts` — prefer `x-real-ip` / rightmost XFF; add a per-**account** durable lockout (10 / 15 min) on top of per-IP.
- `lib/ai/property-doc.ts` — SSRF allowlist (UploadThing CDN hosts only, https, `redirect:"error"`).
- `app/api/uploads/listing-photo/route.ts` — concrete raster type allowlist (rejects SVG).
- `next.config.ts` — `Permissions-Policy`, `poweredByHeader:false`.
- Tests updated (cron opt-in env, IP-precedence assertions); 808 pass.

## ⚠️ REQUIRED before/at production deploy (ops — not code)
1. **Set `SESSION_SECRET`** to a strong unique value (≥32 random bytes) in every deployed env (Vercel). Prod currently has it empty — with the new fail-closed guard the app will refuse to serve sessions until it's set. **Rotate** away from the burned dev value.
2. **Set `CRON_SECRET`** in every deployed env (Vercel cron sends it as the bearer); without it cron now refuses (correct).
3. **Set the Stripe envs** (`STRIPE_*`, price ids) and `STRIPE_WEBHOOK_SECRET` / `DIDIT_WEBHOOK_SECRET` so the `pre_launch` "free featured/verification" and "503 webhook" short-circuits can never fire in prod.
4. Configure `UPSTASH_REDIS_REST_URL/_TOKEN` so rate limits (incl. the new login lockout) are durable across serverless instances.

## Deferred hardening (tracked, not launch-blocking)
- Strengthen CSP with `script-src`/`default-src` (needs a nonce on Next inline scripts — test all pages).
- Add an Origin/Referer check on cookie-authed mutating routes (defense-in-depth beyond SameSite).
- Make `/api/auth/register` responses uniform (or rate-limit) to remove email enumeration.
- Consider a server-side session store for true logout/everywhere-revocation (current model is stateless + exp).
- Magic-byte sniffing on uploads; lower the 512 MB verification-video cap.
