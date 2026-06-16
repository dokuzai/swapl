# Swapl — Authentication & Session Management: Pentest Findings

Authorized pentest of the team's own pre-launch app. Surface: **Authentication & Session Management**.
Target: web app under `app/`, running at `http://localhost:3000` with seeded data.
Date: 2026-06-16. Tester: automated review (code read + dynamic probes, non-destructive).

> All `file:line` references are relative to `app/`.

---

## Severity summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Session cookie signed with a known/default `SESSION_SECRET` → full session forgery & account/admin takeover | **Critical** | CONFIRMED |
| 2 | Signed session has no server-side identity/expiry; logout is not server-invalidatable | **High** | CONFIRMED |
| 3 | Production secret file ships an empty `SESSION_SECRET=""` (falls back to the default) | **High** | CONFIRMED |
| 4 | Predictable + leaked user IDs make forgery trivially targetable (incl. admin) | **Medium** (amplifier of #1) | CONFIRMED |
| 5 | Bearer token refresh has no absolute lifetime cap and is not device-bound | **Low** | SUSPECTED |
| 6 | `otp-verify` / OAuth per-IP limits are loose (30 / window) | **Low / Info** | CONFIRMED |

### Things checked and found SOUND (no action needed)
- HMAC signature validation uses `timingSafeEqual` with a length guard; tampering the body or signature is rejected (returns 401). No `alg=none` class issue — the cookie is HMAC, not JWT. (`lib/auth/session.ts:38-51`)
- Cookie flags: `HttpOnly` set, `SameSite=lax` set, `Secure` set in production. (`lib/auth/session.ts:69-78`)
- OTP: 6-digit crypto-random, SHA-256 hashed at rest, 10-min TTL, **5-attempt** per-code cap, single-use, latest-wins. Not brute-forceable per code. Uniform error responses avoid existence leak. (`lib/auth/otp.ts`, `app/api/auth/otp/verify/route.ts`)
- Password-reset / email-verify tokens: 32-byte random, SHA-256 hashed, single-use atomic consume, reset TTL 1h / verify TTL 7d, latest-wins. Cannot reset another user's password without their token. (`lib/auth/tokens.ts`)
- No host-header poisoning: reset/verify links are built from `NEXT_PUBLIC_APP_URL`, not the request `Host`. (`app/api/auth/verify-email/[token]/route.ts:9`, email templates)
- Telegram login: correct `HMAC-SHA256(key=SHA256(bot_token))` over sorted data-check-string, `timingSafeEqual`, 10-min auth-age window. (`lib/auth/oauth/telegram.ts`)
- OAuth account linking only links to an existing account when the provider **verified** the email (Google enforced verified; Apple requires `email_verified`; Telegram uses a synthetic unverified placeholder so it never links by email). No unverified-email takeover. (`lib/auth/oauth/account.ts:35-91`, `app/api/auth/oauth/apple/route.ts:68`)
- Registration does **not** allow mass-assignment of `role`/`verified`: the `user.create` hardcodes `{ email, passwordHash, name }`; `role` defaults to `member` in schema. (`app/api/auth/register/route.ts:50-52`)
- Mobile bearer tokens: opaque 32-byte random, stored only as SHA-256 hash, expiry enforced, `revokedAt` honored on every read, refresh rotates and revokes the old token. A revoked/expired bearer token is rejected. (`lib/auth/session.ts:92-140`, `app/api/auth/token/refresh/route.ts`, `token/revoke/route.ts`)

---

## Finding 1 — Session forgery via known default `SESSION_SECRET` (CRITICAL, CONFIRMED)

**OWASP:** A02:2021 Cryptographic Failures / A07:2021 Identification & Authentication Failures.
**CWE:** CWE-798 (Hard-coded Credentials), CWE-547 (Use of Hard-coded Security-relevant Constant).

### What
The web session cookie `swapl_session` is `base64url(JSON payload) + "." + HMAC_SHA256(payload, SECRET)`.
`SECRET` falls back to a hard-coded literal, and the committed env files set that **same** literal:

- `lib/auth/session.ts:15`
  ```ts
  const SECRET = process.env.SESSION_SECRET ?? "dev-secret-please-change-this-to-32-random-bytes-minimum";
  ```
- `.env:11` → `SESSION_SECRET="dev-secret-please-change-this-to-32-random-bytes-minimum"`
- `.env.local` → same literal (committed).

The signed payload (`lib/auth/session.ts:18-22`) is only `{ userId, email, name }`. The server trusts `userId` and loads everything else (including `role`) fresh from the DB. **Anyone who knows the secret can mint a valid cookie for any `userId`** — no password, no token, no DB row needed.

### Reproduction (CONFIRMED)
Forge a cookie for a victim user we never authenticated as and read their private account:

```bash
FORGED=$(node -e 'const {createHmac}=require("crypto");
const S="dev-secret-please-change-this-to-32-random-bytes-minimum";
const b=Buffer.from(JSON.stringify({userId:"sim-b1-u-00001",email:"x",name:"x"})).toString("base64url");
console.log(b+"."+createHmac("sha256",S).update(b).digest("base64url"))')

curl -s -H "Cookie: swapl_session=$FORGED" http://localhost:3000/api/me
```
Response (victim's real account, no creds used):
```json
{"user":{"id":"sim-b1-u-00001","email":"sim+b1-00001@sim.swapl","name":"Manon Novák",
"verified":true,"role":"member", ...}, "settings":{...}, "counts":{...}}
```

**Admin takeover** is the same attack against the admin's `userId`. The admin is seeded as `gert@dokuz.ai` with `role:"swapl_admin"` (`prisma/seed.ts:944-954`), and admin authorization is purely `role === "swapl_admin"` loaded by id (`lib/auth/abilities.ts:39,46,62`). Forging `{userId:"<admin id>"}` yields a full admin session, unlocking `app/api/admin/*` (disputes, property-verification approvals). See Finding 4 for how the admin id is obtainable.

### Fix
- Remove the hard-coded fallback. Fail closed at boot if `SESSION_SECRET` is missing or shorter than 32 bytes:
  ```ts
  const SECRET = process.env.SESSION_SECRET;
  if (!SECRET || SECRET.length < 32) throw new Error("SESSION_SECRET missing/too short");
  ```
- Generate a unique secret per environment (`openssl rand -hex 32`); never commit it. Rotate the value that has already been committed to git history — treat it as burned.
- Remove the real secret from `.env`/`.env.local` in the repo; keep only a placeholder in `.env.example`.

---

## Finding 2 — Stateless session: no server-side expiry or revocation; logout doesn't invalidate (HIGH, CONFIRMED)

**OWASP:** A07:2021 Identification & Authentication Failures. **CWE:** CWE-613 (Insufficient Session Expiration), CWE-384 (Session Fixation class).

### What
The cookie payload contains no `iat`/`exp` and no server-side session record (`lib/auth/session.ts:18-51`). The only expiry is the cookie's `Max-Age` (`setSession`, line 76) — a client-side hint. A captured or forged cookie is valid **forever** because:
- `decode()` never checks an expiry — a signature match is sufficient (`lib/auth/session.ts:38-51`).
- Logout calls `clearSession()` which only deletes the cookie in the caller's browser (`app/api/auth/logout/route.ts:8`, `lib/auth/session.ts:80-83`). There is no server-side session table to invalidate, so a copy of the cookie keeps working after "logout."

Consequences: stolen cookies can't be revoked; password change / suspension can't kill existing web sessions; there is no way to force-logout. (By contrast, the mobile bearer path *does* support revocation — only the web cookie is affected.)

### Reproduction
A cookie captured at time T (or forged per Finding 1) continues to authenticate `GET /api/me` indefinitely; hitting `POST /api/auth/logout` in another client does not invalidate the captured copy. (CONFIRMED by code: no server state is consulted or mutated for cookie sessions.)

### Fix
- Embed `iat`/`exp` in the signed payload and reject expired tokens in `decode()`.
- Move to a server-side session store (DB row or signed token list) so logout, password-change, and suspension can revoke. The file header already flags this ("switch to iron-session or NextAuth before launch") — do it before launch.
- On password change / suspension, invalidate all of a user's sessions (bump a per-user `sessionEpoch` included in the signed payload, or delete session rows).

---

## Finding 3 — Empty `SESSION_SECRET` in production env file silently falls back to the default (HIGH, CONFIRMED)

**OWASP:** A05:2021 Security Misconfiguration. **CWE:** CWE-1188 (Insecure Default), CWE-453.

### What
`.env.production.local:7` ships `SESSION_SECRET=""`. An empty string is falsy in JS, so `process.env.SESSION_SECRET ?? "<default>"` — wait: `""` is not nullish, so `??` keeps `""`. Either way the production deployment signs with an **empty or default** secret:
- If `""` survives, the HMAC key is the empty string — trivially forgeable by anyone (no secret needed at all).
- If a deploy step strips empty vars, the code falls to the committed default (Finding 1).

Both outcomes mean production sessions are forgeable. (`.env.production.local:7`, `lib/auth/session.ts:15`.)

### Fix
Set a real 32+ byte secret in the production environment and enforce the boot-time guard from Finding 1 (which rejects both empty and short secrets, converting this from a silent compromise into a loud startup failure).

---

## Finding 4 — Predictable and leaked user IDs make forgery targeted (MEDIUM, CONFIRMED — amplifier of #1/#3)

**OWASP:** A01:2021 Broken Access Control (IDOR-adjacent info exposure). **CWE:** CWE-200 (Information Exposure).

### What
Forgery (Findings 1/3) only needs a target `userId`. Those are easy to obtain:
- **Seeded/sim users use guessable IDs:** `sim-b1-u-00000`, `sim-b1-u-00001`, … (returned by `POST /api/auth/login` as `userId`). Sequential enumeration is trivial.
- **Real users' cuids leak in public-ish API responses.** `GET /api/listings` returns `listing.userId` (the owner's real id) plus `ownerName`:
  ```bash
  curl -s -H "Cookie: <any valid session>" "http://localhost:3000/api/listings?limit=2"
  # → {"items":[{"listing":{"id":"...","userId":"cmqf8py35000j...","ownerName":"Marcus Bell", ...}}]}
  ```
  So an attacker maps a display name (e.g. the admin "Gert (admin)") to a `userId`, then forges that session.

### Fix
- Primary mitigation is Findings 1–3 (a strong secret makes the id useless for forgery).
- Defense in depth: don't expose owner `userId` in list/detail payloads — expose only a non-authz-bearing public handle. Avoid returning internal cuids to clients that don't need them.

---

## Finding 5 — Bearer token refresh: no absolute lifetime, not device-bound (LOW, SUSPECTED)

**OWASP:** A07:2021. **CWE:** CWE-613.

### What
`POST /api/auth/token/refresh` issues a fresh 30-day token and revokes the old one, with no absolute cap — a client (or a thief holding a live token) can refresh indefinitely, so a stolen token can be kept alive forever as long as it's rotated before expiry (`app/api/auth/token/refresh/route.ts`, `issueAuthToken` TTL 30d at `lib/auth/session.ts:16,103`). Refresh is also not bound to a device/key, so possession of the bearer string is sufficient to mint its successor. Lower impact than the cookie issues because bearer tokens are hashed at rest and individually revocable.

### Fix
- Add an absolute session age (e.g. refresh allowed only within N days of original issue; store `issuedAt`/`familyId` and stop refreshing past the cap, forcing re-auth).
- Consider binding refresh to a device key (App Attest / Play Integrity already present at registration) and detect refresh-token reuse (rotation family).

---

## Finding 6 — Loose per-IP limits on otp-verify / OAuth (LOW / INFO, CONFIRMED)

`otp-verify` allows 30 attempts / 15 min per IP (`app/api/auth/otp/verify/route.ts:24`); OAuth endpoints 30 / 5 min. The **per-code 5-attempt cap** (`lib/auth/otp.ts:11,64`) is the real brute-force control and is sound, so the loose IP limit is not independently exploitable for OTP. Login is 30 / 5 min per IP (`login/route.ts:16`) with no per-account lockout — acceptable given strong hashing, but consider a per-account/credential-stuffing throttle. Informational.

---

## Recommended remediation order
1. **Finding 1 + 3** — generate per-env secrets, remove the hard-coded fallback, add the boot-time guard, rotate the burned secret. (Blocks total takeover.)
2. **Finding 2** — add `exp` to the payload + a server-side session store so logout/password-change/suspension actually revoke web sessions.
3. **Finding 4** — stop leaking owner `userId` in API payloads.
4. **Findings 5–6** — absolute session cap + device binding for bearer refresh; tighten/add per-account throttles.
