# Swapl — Native iOS (iPhone + iPad) and Android Apps

## Context

Swapl today is a Next.js 16 / React 19 web app (`/home/user/swapl/app`) for a key‑for‑key home‑swap marketplace, with a rich Prisma model (User, Listing, SwapProposal, SwapAgreement, InsurancePolicy, billing tables), an editorial design system (Cream `#FAF6E8` / Navy `#1A1F3C` / Pink `#F24B8E`, Fraunces + Inter + JetBrains Mono, six city‑palette illustrations), and 12 transactional emails that today fan out via Resend.

The product is at MVP/early‑access stage and needs a mobile presence to (a) capture proposal traffic where users actually live (notifications), and (b) make trip‑time interactions — key codes, insurance, concierge add‑ons — feel first‑class. Per user direction, the app will be **fully native (Swift/SwiftUI on iOS+iPad, Kotlin/Jetpack Compose on Android)** with **full feature parity** with the web (excluding marketing pages), keeping the **same design system 1:1**, and architected for fast scale by sharing a single backend and a single source of truth for design tokens.

## Architecture overview

```
swapl/                                  (existing repo root)
├── app/                                 existing Next.js app
│   ├── app/api/                         extended with mobile endpoints
│   ├── lib/auth/session.ts              extended with Bearer-token mode
│   └── lib/match/score.ts               kept server-side (already exported)
├── packages/
│   └── design-tokens/                   NEW — Style Dictionary source of truth
│       ├── tokens/                      colors, typography, radius, spacing JSON
│       └── build/                       generated outputs:
│           ├── ts/      → app/lib/tokens.ts (web)
│           ├── swift/   → SwaplTokens.swift (iOS)
│           └── kotlin/  → SwaplTokens.kt (Android)
├── ios/
│   └── Swapl/                           Xcode project (SwiftUI, iOS 17+, iPadOS 17+)
└── android/
    └── swapl/                           Gradle project (Compose, minSdk 26 / target 34)
```

One backend, three clients. Tokens drift never happens because both apps consume the generated files.

---

## 1. Backend evolution (Next.js API)

The web today uses RSC + direct Prisma calls for browse, inbox, and detail. Mobile cannot — every screen must hit a JSON endpoint. We will:

### 1a. Dual-mode session (cookie + Bearer)

Modify **`app/lib/auth/session.ts`** to accept either:
- the existing `swapl_session` cookie (web, unchanged), or
- an `Authorization: Bearer <token>` header (mobile).

Reuse the existing HMAC-signed `SessionPayload {userId, email, name}` body so both modes share validation. Add a helper `getSessionFromRequest(req)` that checks header first, then cookie. Token TTL = 30 days, refresh on every authenticated request via a sliding window.

Add **`POST /api/auth/token`**: accepts the same `credentialsSchema` (email + password), returns `{ token, expiresAt, user }`. Mobile clients store the token in **iOS Keychain** / **Android EncryptedSharedPreferences (Tink)**.

Add **`POST /api/auth/token/refresh`** and **`POST /api/auth/token/revoke`** for logout.

### 1b. New GET endpoints (mobile-driven, also useful for SPA migration later)

| Method+Path | Returns | Notes |
|---|---|---|
| `GET /api/me` | current user, subscription, listings count, unread proposals count | drives badge counts |
| `GET /api/listings` | paginated `{items, nextCursor}`; query params mirror `lib/listing-filters.ts` (cities, type, sizeMin, sleepsMin, dateFrom/To, pets, wfh, stepFree, mutualOnly, sort) | reuse `queryListings()` from `lib/listing-query.ts`; cursor on `(featuredUntil DESC, isVerified DESC, score DESC, createdAt DESC, id)` |
| `GET /api/listings/[id]` | full listing + host (verified flag) + match score vs viewer's listing | server-computes score via `lib/match/score.ts` |
| `GET /api/proposals` | inbox bucketed `{waitingOnYou, sent, active, archived}` | matches `app/swaps/page.tsx` logic |
| `GET /api/proposals/[id]` | proposal + agreement (with key codes, only to participants) + insurance policy | strict authz |
| `GET /api/profiles/[id]` | public host data + their active listings + interests | already partially in RSC |
| `GET /api/saved-searches` | already exists |
| `POST /api/uploads/sign` | returns S3/R2 pre-signed PUT URL + final CDN URL | replaces UploadThing for mobile (web keeps UploadThing for now) |
| `POST /api/devices` | register `{platform, apnsToken or fcmToken, locale, appVersion}` for push | one row per device per user |
| `DELETE /api/devices/[id]` | unregister on logout |

All new endpoints reuse existing **Zod validators** in `app/lib/validators.ts` and the **rate limiter** in `app/lib/rate-limit.ts`.

### 1c. Push notification fan-out

Add **`app/lib/push/index.ts`** with `sendPush(userId, payload)` mirroring the email adapter pattern. Use **Firebase Cloud Messaging** as the unified gateway (one SDK, FCM forwards to APNs for iOS).

In every place `sendEmail()` is currently called for a swap event (`proposalReceived`, `proposalAccepted`, `proposalDeclined`, `proposalCountered`, `insurancePolicyCreated`, `preTripReminder`), add a parallel `sendPush()` call. Push payload:
```ts
{ kind: "proposalAccepted", proposalId, deepLink: "swapl://swaps/<id>", title, body }
```

### 1d. Database additions (Prisma)

Two new models (additive, no breaking changes):

```prisma
model AuthToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  tokenHash  String   @unique           // sha256 of opaque token
  platform   String                     // "ios" | "android"
  lastSeenAt DateTime @default(now())
  expiresAt  DateTime
  revokedAt  DateTime?
  @@index([userId])
}

model Device {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  platform   String                     // "ios" | "android"
  pushToken  String                     // APNs device token or FCM registration token
  locale     String?
  appVersion String?
  updatedAt  DateTime @updatedAt
  @@unique([userId, pushToken])
}
```

Migration: `prisma/migrations/<ts>_mobile_auth_devices/`.

---

## 2. Design token pipeline

Create **`packages/design-tokens/`** with a Style Dictionary v4 setup. Source of truth: a single `tokens/` directory of JSON files mirroring what's currently hardcoded in `app/app/globals.css:13-165` and `app/components/illustrations/index.tsx:16-24`:

- `color/core.json` — cream, cream-2, navy, navy-2, navy-3, pink, pink-light, line, tag-bg, card-bg
- `color/semantic.json` — primary, secondary, muted, accent, destructive, background, foreground, border, ring (light + dark)
- `color/cities.json` — six palettes (warm, cool, rose, sage, dusk, sand, mono) × five slots (sky, building, roof, window, accent)
- `typography.json` — fontFamily (display=Fraunces, body=Inter, mono=JetBrains), scale (kicker 11/0.14em, tag 10/0.06em, body 14–16, h1–h6, sectionTitle clamp)
- `radius.json` — base 14, sm/md/lg/xl/2xl multipliers, pill 9999
- `spacing.json` — 4/8/12/16/24/32/48/64
- `shadow.json` — cardHover, switchInner

Build outputs:
- `build/ts/index.ts` — replaces hardcoded values in `app/app/globals.css` (via CSS variables generated at build) and exposed to TS.
- `build/swift/SwaplTokens.swift` — `enum SwaplColor { static let cream = Color(hex: "#FAF6E8") … }` plus `Font` extensions for Fraunces.
- `build/kotlin/SwaplTokens.kt` — `object SwaplColors { val Cream = Color(0xFFFAF6E8) … }` plus `object SwaplType` Compose `TextStyle`s.

Both apps **bundle the Fraunces/Inter/JetBrains Mono TTFs** (downloaded once from Google Fonts, license‑clean) instead of relying on Google Fonts at runtime — register them in `Info.plist` (UIAppFonts) and `res/font/` (Compose `FontFamily`).

---

## 3. iOS app (`ios/Swapl`)

- **Targets**: iOS 17 / iPadOS 17 minimum; SwiftUI primary, UIKit fallback only when SwiftUI lacks an equivalent (none expected). Single universal app.
- **Architecture**: MVVM + Repository.
  - `App/` — `SwaplApp.swift`, root navigation, theme bootstrap, push registration.
  - `Core/Networking/` — `APIClient` (URLSession + async/await), `AuthInterceptor` (injects Bearer + handles 401), `Endpoint` enum mirroring backend routes.
  - `Core/Auth/` — `KeychainTokenStore`, `AuthService` (login/register/refresh/logout).
  - `Core/Models/` — `Codable` mirrors of the API DTOs (one file per domain: Listing, Proposal, Agreement, etc.). Generated from a shared OpenAPI spec — see §6.
  - `Core/Repositories/` — `ListingRepository`, `ProposalRepository`, `MeRepository` — wrap APIClient + SwiftData cache.
  - `Core/Persistence/` — SwiftData models (`@Model`) for offline cache: `CachedListing`, `CachedProposal`, `CachedUser`. Stale‑while‑revalidate pattern.
  - `Core/Push/` — `PushService` (APNs registration, deep‑link routing for `swapl://swaps/<id>` and `swapl://listings/<id>`).
  - `Design/` — `Theme.swift` (re‑exports `SwaplTokens.swift`), `Components/` (Button, Card, Badge, Tag, Pill, KickerLabel, MatchBadge, Switch, Tabs — visual parity with `app/components/ui/*`), `Illustrations/` (CityIllust, HouseGlyph, SwapArrows, LogoMark, Pin, StepIllust as SwiftUI views drawing the same SVG paths via `Path` / `Shape`).
  - `Features/` — one folder per feature with `View`, `ViewModel` (`@Observable`), `Routes`:
    - `Auth/` — Login, Register
    - `Listings/` — Browse (filter sheet), Detail (photo carousel, propose-swap form), Create (8-step wizard using `TabView(.page)` paged), Edit
    - `Swaps/` — Inbox (segmented 4 buckets), Thread (accept/decline/counter/withdraw, key‑code reveal, insurance card)
    - `Profile/` — Dashboard, Account (interests, saved searches, AI prefs, billing), PublicProfile
    - `Concierge/` — add‑ons purchase, travel partners
    - `Verification/` — record video walkthrough (AVFoundation), submit
    - `Featured/` — purchase featured slot (Stripe via `STPPaymentSheet`)
- **iPad layout**: top‑level `NavigationSplitView` with three columns: sidebar (Browse / Swaps / Dashboard / Account), content list (e.g. listings results, swaps inbox), detail pane (listing or thread). Browse filters move from a sheet to a permanent inspector column. Listing detail uses a two‑column split (gallery + sidebar) on regular size class, single column on compact. Proposal thread stays single‑column even on iPad regular for focus.
- **Maps**: MapKit (`Map` SwiftUI view) with custom annotation views drawing the city‑palette `Pin`. Mapbox optional later via `MapboxMaps`.
- **Image loading**: **Nuke** (`LazyImage`) — same modifiers as SwiftUI `Image`, prefetches in lists, low memory.
- **Payments**: Stripe Mobile SDK (`StripePaymentSheet`) for subscription, verification (€39), featured (€19+), concierge add‑ons. Backend already issues PaymentIntents via existing `/api/billing/*` and `/api/listings/{verify,featured}` routes — they just need to return `client_secret` instead of the web `Checkout` URL.
- **Deep linking**: Universal Links (`apple-app-site-association` hosted at `https://swapl.fun/.well-known/`) covering `/listings/:id`, `/swaps/:id`, `/profile/:id`, `/account/saved-searches`. Custom `swapl://` scheme for push payloads.

---

## 4. Android app (`android/swapl`)

- **Targets**: minSdk 26 (Android 8), targetSdk 34, Compose BOM 2024.10+.
- **Architecture**: MVVM + Repository, identical layering to iOS:
  - `app/` — `SwaplApplication`, Hilt graph, `MainActivity` (single `setContent { SwaplApp() }`), push token registration.
  - `core/network/` — Ktor or Retrofit + OkHttp + kotlinx-serialization. `AuthInterceptor` injects Bearer, handles 401 with refresh.
  - `core/auth/` — `EncryptedTokenStore` (Tink), `AuthRepository`.
  - `core/model/` — `@Serializable` DTOs (generated from the same OpenAPI as iOS).
  - `core/data/` — Repositories (Listing, Proposal, Me, etc.) backed by Room cache + remote.
  - `core/persistence/` — Room entities/DAOs mirroring SwiftData ones.
  - `core/push/` — Firebase Messaging service, intent routing.
  - `design/` — `SwaplTheme` (consumes `SwaplTokens.kt`), `components/` (Button, Card, Badge, Tag, Pill, MatchBadge, KickerLabel, swapl-Switch, Tabs — Compose equivalents of shadcn primitives), `illustrations/` (Compose `Canvas` reproducing each SVG, palette‑driven).
  - `features/` — same folder structure as iOS (`auth`, `listings`, `swaps`, `profile`, `concierge`, `verification`, `featured`).
- **Tablet layout**: Compose `WindowSizeClass` — on `Expanded` width use `NavigationSuiteScaffold` with rail + detail pane (master‑detail) for browse and inbox.
- **Maps**: Google Maps Compose (`com.google.maps.android:maps-compose`).
- **Image loading**: **Coil 3** Compose API.
- **Payments**: Stripe Android SDK `PaymentSheet`.
- **Deep linking**: App Links (`assetlinks.json` at `https://swapl.fun/.well-known/`) on the same paths as iOS, plus `swapl://` scheme.

---

## 5. Feature parity matrix (full‑parity release)

Excluded from mobile per user direction: marketing pages (landing, how‑it‑works, insurance — replaced with a single in‑app "About" screen).

| Feature | Web file | iOS feature folder | Android feature folder |
|---|---|---|---|
| Login / Register | `app/(auth)/{login,register}/` | `Features/Auth` | `features/auth` |
| Browse + 9‑filter sidebar | `app/listings/page.tsx`, `components/filters/filter-sidebar.tsx` | `Features/Listings/Browse` | `features/listings/browse` |
| Listing detail + propose‑swap | `app/listings/[id]/page.tsx` | `Features/Listings/Detail` | `features/listings/detail` |
| 8‑step listing wizard | `app/listings/new/listing-form.tsx` | `Features/Listings/Create` | `features/listings/create` |
| Edit listing | `app/listings/[id]/edit/page.tsx` | `Features/Listings/Edit` | `features/listings/edit` |
| Verification (€39 video) | `app/listings/[id]/edit/verify/` | `Features/Verification` | `features/verification` |
| Featured purchase (€19+) | `app/listings/[id]/edit/featured/` | `Features/Featured` | `features/featured` |
| Swap inbox (4 buckets) | `app/swaps/page.tsx` | `Features/Swaps/Inbox` | `features/swaps/inbox` |
| Swap thread (accept/decline/counter/withdraw, key codes, insurance) | `app/swaps/[id]/page.tsx` | `Features/Swaps/Thread` | `features/swaps/thread` |
| Concierge add‑ons | concierge component on thread | `Features/Concierge` | `features/concierge` |
| Travel affiliate cards | thread sidebar | `Features/Swaps/Thread/AffiliatesSection` | `features/swaps/thread/affiliates` |
| Dashboard | `app/dashboard/page.tsx` | `Features/Dashboard` | `features/dashboard` |
| Account (profile, AI, interests, saved searches, billing) | `app/account/**` | `Features/Account` | `features/account` |
| Public profile | `app/profile/[id]/page.tsx` | `Features/PublicProfile` | `features/profile` |
| Reporting | `POST /api/reports` (no UI) | `Features/Report` (sheet on listing & profile) | `features/report` |

Push notifications cover all 12 transactional emails — same payload kinds as the email templates in `app/emails/templates.tsx`.

---

## 6. Type sharing & contract enforcement

To keep three clients in lock‑step at scale:

1. Annotate every API route with **Zod → OpenAPI** via `@asteasolutions/zod-to-openapi`, exporting `app/openapi.json` at build time.
2. Generate Swift types via `swift-openapi-generator` (Apple‑official) into `ios/Swapl/Core/Models/Generated/`.
3. Generate Kotlin types via `openapi-generator` (`kotlin` generator with `kotlinx-serialization`) into `android/swapl/core/model/generated/`.
4. CI step fails if `openapi.json` changes without regenerated mobile types.

---

## 7. Scale & operations

- **Monorepo**: introduce **pnpm workspaces** at the repo root with `app/`, `packages/design-tokens/`, plus a thin `packages/api-types/` for the OpenAPI artifact. iOS/Android Gradle/Xcode projects sit alongside but are not pnpm packages.
- **Postgres for prod**: already prepared (`prisma/schema.postgres.prisma`). Mobile will exacerbate read load — add the obvious indexes on `Listing(city, isVerified, featuredUntil DESC)`, `SwapProposal(targetListingId, status)`, `SwapProposal(proposerId, status)`, `Device(userId)`, `AuthToken(tokenHash)`.
- **Rate limiting**: replace the in‑memory `lib/rate-limit.ts` with **Upstash Ratelimit** before the mobile launch (mobile multi‑device usage will break per‑instance memory limits).
- **CDN images**: move from UploadThing to **Cloudflare R2 + Images** for the listing photo store; signed PUT URLs from `/api/uploads/sign`. Web continues to consume the same URLs.
- **Observability**: **Sentry** SDKs (Cocoa, Android, Next.js) wired to the same project; **PostHog** for product analytics with shared distinct IDs across web + mobile (set on auth).
- **CI/CD**: GitHub Actions matrix —
  - `web` job: lint, typecheck, build (existing).
  - `tokens` job: rebuild `packages/design-tokens` and fail if generated outputs drift.
  - `ios` job: SwiftLint + `xcodebuild test` on macOS runners. TestFlight upload on `main` via Fastlane / Xcode Cloud.
  - `android` job: ktlint + `./gradlew test connectedCheck`. Internal Track upload via Fastlane on `main`.
- **Crash/feature flags**: GrowthBook or LaunchDarkly (web already TS‑ready) — wire SDKs in both apps and gate risky launches (e.g. push notification opt‑in, concierge purchase).

---

## 8. Phased delivery (within "full parity" scope)

Even with full parity as the goal, ship in slices to get user value early:

- **Slice 1 — Foundations (3 weeks)**: design‑tokens package, dual‑mode session + Bearer endpoints, `GET /api/me`, `GET /api/listings`, `GET /api/listings/[id]`, OpenAPI generation. Both apps shell + theming + auth + browse + detail (read‑only).
- **Slice 2 — Core swap loop (3 weeks)**: `GET /api/proposals*`, propose‑swap, inbox 4 buckets, thread with accept/decline/counter/withdraw, key codes, insurance panel, push notifications wired for proposal events.
- **Slice 3 — Listing creation + account (3 weeks)**: 8‑step wizard with R2 uploads, edit, dashboard, account (profile, interests, saved searches, AI prefs).
- **Slice 4 — Monetization (3 weeks)**: verification (€39 video), featured purchase (€19+), subscription via Stripe PaymentSheet, concierge add‑ons, travel affiliates, public profile, reporting sheet.

---

## 9. Critical files to modify or add

**Modify:**
- `app/lib/auth/session.ts` — add Bearer/header path; export `getSessionFromRequest`.
- `app/lib/rate-limit.ts` — swap to Upstash before launch.
- `app/lib/email/index.ts` — call sites also fan out to push.
- `app/app/globals.css` — replace literal hex with CSS variables sourced from `packages/design-tokens` build output.
- `app/prisma/schema.prisma` and `schema.postgres.prisma` — add `AuthToken`, `Device`.
- `app/app/api/listings/route.ts`, `app/app/api/proposals/route.ts` — add `GET` handlers (currently POST‑only).
- All proposal action sites in `app/app/api/proposals/[id]/route.ts` — add `sendPush()` parallel to `sendEmail()`.

**Add:**
- `app/app/api/auth/token/route.ts`, `.../refresh/route.ts`, `.../revoke/route.ts`
- `app/app/api/me/route.ts`
- `app/app/api/listings/[id]/route.ts` (GET)
- `app/app/api/proposals/[id]/route.ts` (GET, alongside existing POST)
- `app/app/api/profiles/[id]/route.ts`
- `app/app/api/uploads/sign/route.ts`
- `app/app/api/devices/route.ts`, `.../[id]/route.ts`
- `app/lib/push/index.ts` (FCM adapter)
- `packages/design-tokens/` (full Style Dictionary setup)
- `ios/Swapl/` (Xcode project, all folders described in §3)
- `android/swapl/` (Gradle project, all folders described in §4)
- `pnpm-workspace.yaml` at repo root.
- `swapl.fun/.well-known/{apple-app-site-association,assetlinks.json}` deployed via the existing Vercel project.

**Reuse (do NOT duplicate):**
- `app/lib/match/score.ts` — match scoring stays server‑side; mobile receives precomputed score.
- `app/lib/listing-query.ts` — `queryListings()` powers the new `GET /api/listings`.
- `app/lib/listing-filters.ts` — URL ↔ filter mapping reused for query‑string parsing on the new GET.
- `app/lib/validators.ts` — every Zod schema reused; no duplicate validation.
- `app/lib/cities.ts` — city → palette/country mapping; emitted into design‑tokens output for mobile.
- `app/emails/templates.tsx` — copy is reused by push payload `title`/`body` strings.

---

## 10. Verification

End‑to‑end checks before each slice ships:

1. **Backend**: `pnpm --filter app test` + new integration tests in `app/tests/api/` covering each new endpoint (auth/token round‑trip, listings list pagination, proposals authz, device register/unregister). Manually `curl -H 'Authorization: Bearer …'` each endpoint to confirm token mode works.
2. **Design tokens**: `pnpm --filter design-tokens build && pnpm --filter design-tokens test` — snapshot test that generated Swift, Kotlin, and TS outputs match committed fixtures.
3. **iOS**: `xcodebuild test -scheme Swapl -destination 'platform=iOS Simulator,name=iPhone 16'` and `'name=iPad Pro 13-inch'` — UI snapshot tests for theme components and split‑view layout. Manual smoke: log in with `asli@demo.swapl` / `swapl-demo`, browse, open the active swap with `maartje`, confirm key codes render and insurance card matches web.
4. **Android**: `./gradlew testDebugUnitTest connectedDebugAndroidTest` — Compose UI tests. Manual smoke on a phone (compact) and a tablet (expanded) emulator with the same demo account.
5. **Push**: trigger a proposal from a second account against the demo user, confirm push received within 5s on both platforms and tapping the notification deep‑links into the correct thread.
6. **Parity audit**: side‑by‑side screenshots of each web screen vs iOS vs Android in light + dark mode; designer signs off on color, typography, illustration fidelity before each slice merges to `main`.
7. **Store readiness** (before Slice 4 release): App Store privacy nutrition labels, Play Data Safety form, screenshots in 6.9"/6.7"/iPad/Phone/Tablet sizes, Stripe in‑app purchase compliance review (subscriptions go through Stripe web for now to avoid 30% take — opens external browser on iOS, complies with Apple's 2024 Reader rules for marketplaces).
