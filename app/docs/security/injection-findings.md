# Injection / SSRF / XSS / File-Upload / Deserialization — Pentest Findings

Authorized pentest of swapl (pre-launch). Surface: injection, SSRF, XSS, file
upload, deserialization, open redirect, prototype pollution.

- Target: `http://localhost:3000`, web code under `app/`.
- Auth: `POST /api/auth/login {"email":"sim+b1-00000@sim.swapl","password":"swapl-demo"}` (cookie jar).
- Date: 2026-06-16. All probes non-destructive.

## Summary table

| # | Finding | Severity | OWASP | Status |
|---|---------|----------|-------|--------|
| 1 | SSRF in property-verification document fetch | High | A10:2021 SSRF | CONFIRMED (code path), env-gated to anthropic provider |
| 2 | File-upload content-type allows `image/svg+xml` | Low | A03 / A04 | CONFIRMED (validation gap), impact limited by cross-origin CDN |
| 3 | SQL/NoSQL injection | — | A03 | NOT FOUND (Prisma parameterized, filters allowlisted) |
| 4 | Stored/reflected XSS | — | A03 | NOT FOUND (React escaping; only `dangerouslySetInnerHTML` is a self-built escaped SVG) |
| 5 | Open redirect (affiliate / auth) | — | A01 | NOT FOUND (hardcoded hosts / allowlist) |
| 6 | Prototype pollution (settings / feedback context) | — | A08 | NOT FOUND (zod allowlist + JSON-string storage) |

---

## Finding 1 — SSRF via property-verification document URLs (HIGH, CONFIRMED)

**OWASP:** A10:2021 Server-Side Request Forgery.

**Location:**
- Sink: `app/lib/ai/property-doc.ts:165-189` (`buildImageBlocks` → `fetch(url, …)` at `:169`).
- Reachable from: `app/app/api/listings/[id]/property-verification/route.ts:99-143`
  (POST), input validated only as `z.string().url()` at `:21`.
- Config gate: `app/lib/ai/property-doc.ts:102` (`isVisionCapable`) + `:78-80`
  (vision capable only when provider === "anthropic").

**Description:**
An authenticated host submits property-verification documents as
`{ "documents": [{ "url": "<any-url>", "label": "..." }] }`. The URL is
validated only as a syntactically-valid URL (`z.string().url()`), which accepts
`http://169.254.169.254/...`, `http://localhost:3000/...`, `http://127.0.0.1:port/`,
internal hostnames, and `http(s)` to arbitrary ports. When the active AI
provider is vision-capable (anthropic), the server fetches up to 4 of these URLs
server-side (`buildImageBlocks`, `fetch(url, { signal: AbortSignal.timeout(10000) })`)
with no host/scheme allowlist, no private-IP/DNS-rebinding protection, and no
redirect restriction. This is a classic blind/semi-blind SSRF: the attacker
controls the destination of an outbound request from the app server.

Content-type is checked *after* the request returns (only `image/*` bodies are
embedded), but the request itself still reaches the target — sufficient for
internal port scanning, hitting cloud metadata endpoints (e.g. AWS IMDSv1
`http://169.254.169.254/latest/meta-data/`), and reaching internal-only
services. Timing differences (connect vs. timeout) leak reachability.

**Gating / exploitability:**
- The route calls `classifyPropertyDocument({...})` **without** a `userOverride`
  (route `:134-143`), so config resolution falls to the environment default
  (`resolveAIConfig`, `app/lib/ai/providers.ts:58-82`).
- Locally `AI_PROVIDER=kimi` (`.env`), and `isVisionCapable("kimi") === false`,
  so the fetch is gated OFF on this dev box — which is why the live probe below
  produced no outbound hit.
- In any environment where `AI_PROVIDER=anthropic` (a documented, supported
  production configuration — `providers.ts:1-13`), the fetch fires on every
  submission. Anthropic is one of three first-class providers, so this is a
  realistic prod config, not a corner case. Hence CONFIRMED at the code level,
  environment-gated.

**Reproduction (live, on a host configured with `AI_PROVIDER=anthropic`):**
```bash
# login
curl -s -c /tmp/swapl.jar -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sim+b1-00000@sim.swapl","password":"swapl-demo"}'

# submit a verification on a listing you own, pointing at an internal target
curl -s -b /tmp/swapl.jar -X POST \
  "http://localhost:3000/api/listings/sim-b1-l-00000/property-verification" \
  -H 'Content-Type: application/json' \
  -d '{"documents":[{"url":"http://169.254.169.254/latest/meta-data/","label":"deed"}],"documentType":"deed"}'
# → 201 Created; server-side GET to 169.254.169.254 fires during AI classification.
```
Evidence captured this session: the endpoint accepted
`{"url":"http://127.0.0.1:9099/ssrf-probe","label":"deed"}` and returned
`201` with the URL stored verbatim (`z.string().url()` imposes no host
restriction). The outbound fetch did not fire on this box only because the dev
provider is `kimi` (non-vision), confirming the gate is purely the provider
config, not URL validation.

**Fix:**
- Restrict document URLs to your own upload origin (UploadThing/`utfs.io`/`ufsUrl`
  host) — these documents are meant to come from the upload pipeline, so an
  allowlist of the upload CDN host is the correct constraint:
  ```ts
  const ALLOWED_UPLOAD_HOSTS = new Set(["utfs.io", "<your-app>.ufs.sh"]);
  const u = new URL(input.url);
  if (u.protocol !== "https:" || !ALLOWED_UPLOAD_HOSTS.has(u.hostname)) reject;
  ```
- Validate at the zod boundary (`documentSchema` in the route) AND again before
  `fetch` in `buildImageBlocks` (defense in depth).
- Block private/link-local/loopback IP literals and resolve-then-check to defeat
  DNS rebinding; disable redirects on the fetch (`redirect: "error"`).

---

## Finding 2 — File upload accepts `image/svg+xml` (LOW, CONFIRMED validation gap)

**OWASP:** A04:2021 Insecure Design / A03 (XSS via uploaded SVG).

**Location:** `app/app/api/uploads/listing-photo/route.ts:29-31`
(`if (!file.type.startsWith("image/")) …`). The UploadThing router
`app/app/api/uploadthing/core.ts` `listingPhoto: f({ image: {...} })` similarly
keys on the broad `image` category.

**Description:**
The native photo-upload endpoint allows any file whose declared MIME type
starts with `image/`, which includes `image/svg+xml`. An SVG can carry
`<script>`/`onload` and become stored XSS *if* it is ever served from swapl's
own origin and navigated to directly. The check trusts the client-supplied
`file.type` (no magic-byte sniffing), and there is no extension allowlist.

**Why LOW (not High):** uploaded files are stored on UploadThing and served from
its CDN (`ufsUrl` / `utfs.io`), a **different origin** from the app. Photos are
rendered via `<img src=…>` (cross-origin), where SVG scripts do not execute, and
a same-origin navigation to the uploaded SVG is not part of the app flow.
Impact is therefore limited to (a) serving active-content SVGs to anyone who
opens the raw CDN link, and (b) content-type spoofing of stored "images."

**Reproduction:**
```bash
# Multipart upload of an SVG passes the image/* check (returns a CDN URL when
# UPLOADTHING_TOKEN is configured; returns 503 "not configured" locally):
curl -s -b /tmp/swapl.jar -X POST http://localhost:3000/api/uploads/listing-photo \
  -F 'file=@evil.svg;type=image/svg+xml'
# evil.svg: <svg xmlns="http://www.w3.org/2000/svg"><script>/*...*/</script></svg>
```

**Fix:** allowlist concrete raster types (`image/jpeg|png|webp|gif|heic`),
reject `image/svg+xml`, and sniff magic bytes rather than trusting `file.type`.
If SVG must be supported, sanitize (e.g. DOMPurify/`svg-sanitizer`) and/or force
`Content-Disposition: attachment` + `Content-Security-Policy: sandbox` on serve.

---

## Finding 3 — SQL / NoSQL injection: NOT FOUND

- No `$queryRaw(Unsafe)` / `$executeRaw(Unsafe)` / string-built queries in app
  code (only in generated Prisma internals + a comment at `lib/admin/metrics.ts:193`).
  All DB access is via Prisma's parameterized query builder.
- Listing search filters are strictly allowlisted before reaching Prisma:
  `app/lib/listing-filters.ts:36-78` — `sort` ∈ {match,newest,size_desc,size_asc},
  `spaceType` ∈ {entire_place,private_room}, `propertyTypes` uppercased and used
  as parameterized `where` values, `orderBy` built from a fixed map
  (`app/lib/listing-query.ts:135-146`). No user string flows into a field name,
  `orderBy` key, or raw SQL.
- Verified live: `GET /api/listings?sort=foo'--&city=...` returns normal results
  (invalid sort silently defaults to "match"); no error/injection.

## Finding 4 — Stored / reflected XSS: NOT FOUND

- The only `dangerouslySetInnerHTML` in the codebase is
  `app/components/story/story-share-card.tsx:100`, rendering a **self-generated**
  SVG string. All interpolated user/dynamic values (`refDisplay`, `labels`) pass
  through `escapeXml()` (`:54-58`); numeric counts are numbers. Not injectable.
- Email templates (`app/emails/templates.tsx`, `_shell.tsx`) use React Email JSX
  — escaped by default, no raw-HTML sinks.
- AI city-art "postcard" is rendered through normal React JSX
  (`app/components/illustrations/postcard.tsx`); fields are enum-constrained
  (palette/sky/weather) or escaped as text nodes. No SVG-string injection.
- User strings (message body, listing title/description, bio/bioVibe, review
  text, names) are rendered as React children → auto-escaped. No `ReactMarkdown`
  / `innerHTML` / `.html()` rendering of user input found.

## Finding 5 — Open redirect / SSRF in redirector & affiliate: NOT FOUND

- `app/app/api/affiliate/[partnerSlug]/route.ts` gates `partnerSlug` against a
  hardcoded `ALLOWED` set and builds the destination from
  `app/lib/affiliates/links.ts:30-66`, where every partner URL has a
  **hardcoded `https://` host**; user input only fills query/search params, never
  the host. No way to redirect off the four partner domains.
- Other `NextResponse.redirect` call sites use internal/hardcoded targets
  (`auth/logout`, `auth/verify-email`, `verification/session`); no user-supplied
  `next`/`returnTo`/`callbackUrl`/`redirect_uri` is honored as a destination.

## Finding 6 — Prototype pollution / mass-assignment: NOT FOUND

- `profile/settings` PATCH: strict zod schema of 4 boolean keys; merge
  (`app/lib/settings.ts:38-45`) iterates a fixed `KEYS` allowlist — `__proto__`
  cannot be assigned. Verified: `{"__proto__":{...}}` → 400.
- `app-feedback` `context` (`z.record(z.string(), z.unknown())`) is
  `JSON.stringify`'d into a String column (`app/app/api/app-feedback/route.ts:18`),
  never merged into a live object. A `__proto__` key payload returned **400**
  (rejected at the zod boundary). No pollution.
- No `Object.assign(target, body)` / `lodash.merge` / deep-merge of raw request
  bodies found in API routes.

---

## Notes / lower-priority observations

- `videoUrl` (listing verify, `app/app/api/listings/verify/route.ts:23`) is only
  **stored**, not server-fetched — no SSRF; it is rendered as a link/embed, so
  ensure the UI does not auto-embed arbitrary origins.
- `verificationVideo` UploadThing router allows 512 MB MP4/MOV; DoS/storage-abuse
  consideration, not in scope here.
- `city-illustration` route constrains city to a known catalog (`findCity`) and
  does not fetch user URLs — no SSRF.
