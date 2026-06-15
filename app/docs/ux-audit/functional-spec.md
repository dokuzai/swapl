# Swapl — Functional Spec: Web P0 CX Remediation

**Prepared by:** Functional analyst
**Date:** 2026-06-15
**Source documents:** `cx-report.md`, `web-findings.md`, `android-findings.md`, `ios-findings.md`, `sim-summary.json` (all in `docs/ux-audit/`)
**Scope of this session:** the **web app only** (Next.js, `app/`) — the only target that is fully build- and test-verifiable this session. Mobile (iOS/Android) equivalents are captured as a non-built follow-up appendix.

## Scope mapping (CX themes → this spec)

| CX theme | This spec | Status here |
|---|---|---|
| T2 — No "rate the app experience" capability (P0) | **A** — App experience feedback feature | Build (web) |
| T1 — i18n / localization gap (P0) | **B** — Web swaps/inbox/conversation i18n + localized dates + amenity/property labels | Build (web) |
| T4 — "Accept & insure" silent insurance consent (P1, EU consent) | **C** — Accept & insure consent clarification | Build (web) |

T1 and T2 are the two named launch-blockers. T4 is pulled in because it lives in the exact web conversation surface that B already touches and is an EU consent issue worth closing before the IT launch. T3, T5–T15 are out of scope for this session.

**Dual-schema rule (MANDATORY for A):** every Prisma model/field change must be applied **identically** to BOTH `prisma/schema.prisma` (SQLite, local dev) and `prisma/schema.postgres.prisma` (Postgres, prod). Any JSON-bearing column must be typed `String` in **both** schemas (JSON is stored as JSON-encoded TEXT and parsed at the app layer) — never `Json`. Local SQLite does not typecheck against the Postgres client, so the prod build is the source of truth; the two files must not drift.

---

## A — App experience feedback / rating

### A.1 User story

> As a Swapl member, after a meaningful moment (completing a swap, leaving a traveller review, or any time from my account), I want to rate my experience **with the app itself** and optionally leave a comment, so the product team can measure launch CSAT and I have an in-app vent valve instead of going straight to a public store review.

This is distinct from `SwapReview` (traveller→traveller). `SwapReview` rates the other person; this rates the **product**. They must be persisted separately.

### A.2 Acceptance criteria

1. A member can submit an app-experience rating consisting of: a **score** (integer 1–5), an optional **comment** (free text, ≤ 1000 chars), and an automatically-attached **source/client tag** (`web` | `ios` | `android`).
2. The rating is persisted in a new `AppFeedback` model, separate from `SwapReview`, linked to the authoring `User`.
3. The submission optionally carries a lightweight **context** payload (e.g. `{ "surface": "post-swap", "agreementId": "..." }`) so we know which moment triggered it. This context is stored as a **`String` (JSON-encoded)** column — `String` in **both** schemas.
4. The feature surfaces in **three** places on web:
   - **Always-available entry:** a "Valuta l'app" (Rate the app) row in the account/support area (`app/account` / settings), open at any time.
   - **Post-swap prompt:** after a swap is marked completed (trip cockpit / completed state), a one-time inline prompt.
   - **Post-review prompt:** after a member submits a `SwapReview`, a follow-on inline prompt.
   - Post-swap and post-review prompts must be **dismissible** and must not re-nag: once a member submits or dismisses for a given surface+context, that prompt does not reappear for the same context.
5. Validation is enforced server-side with Zod: `score` is an integer 1–5; `comment` is optional and ≤ 1000 chars; `source` ∈ {`web`,`ios`,`android`}; `context` is optional and, if present, must serialize to a JSON string ≤ 2000 chars.
6. Unauthenticated requests get `401`; invalid bodies get `400` with `{ error }`; a successful submission returns `201`/`{ ok: true }`.
7. A member may submit **multiple** app-feedback rows over time (NPS/CSAT trend), but at most **one per (user, surface, contextKey)** to satisfy AC-4's no-re-nag rule (enforced by a unique index + upsert; a plain "always-available" submission uses a null/empty contextKey and is rate-limited, not uniquely constrained — see A.4 note).
8. The score and comment are never shown to the rated party or any other member (internal signal only); a future `/admin` surface may read it, but no admin UI is in scope here.

### A.3 Data / schema changes (apply to BOTH schema files)

New model `AppFeedback`. Identical text in `prisma/schema.prisma` and `prisma/schema.postgres.prisma`:

```prisma
model AppFeedback {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation("AppFeedbackAuthored", fields: [userId], references: [id], onDelete: Cascade)
  score      Int      // 1..5, validated at the API layer (SQLite has no CHECK via Prisma)
  comment    String?  // optional free text, ≤ 1000 chars (validated at API)
  // Client that submitted: "web" | "ios" | "android". Validated at the API layer.
  source     String
  // Which moment triggered this: "account" | "post-swap" | "post-review".
  surface    String   @default("account")
  // Stable key for the triggering context (e.g. agreement id) used to de-dupe
  // the no-re-nag rule. Empty string for the always-available account entry.
  contextKey String   @default("")
  // Free-form JSON CONTEXT, stored JSON-ENCODED as TEXT. Dual-schema rule:
  // MUST be `String` in BOTH schema.prisma and schema.postgres.prisma — never `Json`.
  context    String?
  createdAt  DateTime @default(now())

  @@unique([userId, surface, contextKey])
  @@index([userId])
  @@index([source])
  @@index([createdAt])
}
```

Add the back-relation on `User` (in **both** schemas), alongside the existing `ReviewsAuthored` / `ReviewsReceived` relations:

```prisma
  appFeedback  AppFeedback[] @relation("AppFeedbackAuthored")
```

> **Note on the unique index + always-available entry:** the `@@unique([userId, surface, contextKey])` cleanly de-dupes the `post-swap` (contextKey = agreementId) and `post-review` (contextKey = agreementId) prompts. For the always-available `account` surface where `contextKey = ""`, a strict unique constraint would allow only one lifetime rating; instead the API uses **upsert** for `account` (latest rating overwrites prior, keeping one trend point per user for that surface) OR — if product wants full history — drop `account` from the unique tuple and rate-limit in the route. Default decision for this spec: **upsert on the unique tuple** (simplest, satisfies AC-7, one row per (user,surface,contextKey)). Flag for PM confirmation.

**Migration:** generate a Prisma migration after editing both files. Local dev runs against SQLite; prod build typechecks against the Postgres client, so verify `prisma generate` succeeds for the Postgres schema before considering the change done.

### A.4 API changes

New route handler: **`app/api/app-feedback/route.ts`** (mirrors the existing `app/api/reports/route.ts` shape).

- **`POST /api/app-feedback`**
  - Auth: `getSessionFromRequest(req)`; `401 { error: "UNAUTHENTICATED" }` if absent.
  - Body validated by `appFeedbackSchema` (new, in `lib/validators.ts`):
    ```ts
    export const appFeedbackSchema = z.object({
      score: z.number().int().min(1).max(5),
      comment: z.string().trim().max(1000).optional(),
      source: z.enum(["web", "ios", "android"]),
      surface: z.enum(["account", "post-swap", "post-review"]).default("account"),
      contextKey: z.string().max(200).default(""),
      context: z.record(z.unknown()).optional(), // serialized to String before persist
    });
    ```
  - On success: serialize `context` with `JSON.stringify` (or `null`) before writing to the `String` column; `prisma.appFeedback.upsert({ where: { userId_surface_contextKey: {...} }, update: {...}, create: {...} })`. Return `201 { ok: true }`.
  - Invalid body → `400 { error: "Invalid input" }`.
  - The `source` field for web submissions is set/validated as `"web"` (the client sends it; the server trusts the enum but this endpoint is shared by all clients, which is why the tag is part of the contract).

- **(Optional, not required this session) `GET /api/app-feedback`** — admin-gated aggregate read. Out of scope; note for the future `/admin/metrics` CSAT panel.

### A.5 Client surfaces (web)

| Surface | File(s) | Behaviour |
|---|---|---|
| Always-available entry | `app/account/*` (support/settings section) | Add "Valuta l'app" row → opens a feedback modal/sheet (1–5 star/scale + optional comment). `source: "web"`, `surface: "account"`, `contextKey: ""`. |
| Post-swap prompt | trip cockpit / completed-swap view under `app/trips/*` (e.g. `app/trips/swap-trip-card.tsx` or the completed state) | After completion, render a dismissible inline prompt. `surface: "post-swap"`, `contextKey: agreementId`, `context: { agreementId }`. Hide if already submitted/dismissed for that agreement. |
| Post-review prompt | the `SwapReview` submit flow (review dialog/page) | After a successful traveller review POST, show the app-rating prompt. `surface: "post-review"`, `contextKey: agreementId`. |
| Shared component | new `components/feedback/app-rating-dialog.tsx` (or `app/_components`) | One reusable client component posting to `/api/app-feedback`; takes `surface`/`contextKey`/`context` props; all strings via `useT()` (see B). |

All visible strings in these surfaces go through the i18n dictionary (new keys under an `appFeedback.*` namespace in `dict-en.ts` + `dict-it.ts`).

### A.6 Affected files (A)

- `prisma/schema.prisma` — add `AppFeedback` + `User.appFeedback` relation.
- `prisma/schema.postgres.prisma` — **identical** addition (dual-schema rule).
- `prisma/migrations/*` — new migration.
- `lib/validators.ts` — add `appFeedbackSchema`.
- `app/api/app-feedback/route.ts` — new POST handler.
- `components/feedback/app-rating-dialog.tsx` — new shared client component.
- `app/account/*` — add the always-available "Valuta l'app" entry.
- `app/trips/*` (completed-swap surface) — post-swap prompt.
- `SwapReview` submit surface — post-review prompt.
- `lib/i18n/dict-en.ts`, `lib/i18n/dict-it.ts` — `appFeedback.*` keys.

---

## B — Web swaps/inbox/conversation i18n + localized dates + amenity/property labels

### B.1 User story

> As an Italian member (IT is the default launch locale), I want the swap inbox, the conversation/negotiation screen, dates, and listing amenity/property labels to render in Italian, so the product doesn't feel "built for someone else" at the highest-stakes moment of the funnel.

### B.2 Acceptance criteria

1. Every hardcoded English literal in the web **swaps inbox** and **conversation** surface renders through the i18n dictionary and shows Italian under the IT locale. Confirmed targets (from `web-findings.md` W1 and grep):
   - `app/swaps/page.tsx:25` — `"Swap inbox"`.
   - `app/swaps/page.tsx:27` — `"{n} waiting on you · {n} waiting on them · {n} active"`.
   - `app/swaps/conversation-list.tsx:122` — `"Search conversations"`; status map labels at `:20` (`PENDING: "Pending"`, etc.); tab labels `ALL / HOSTING / TRAVELING / ARCHIVED`.
   - `app/swaps/status-pill.tsx:4` — status labels (`Pending`, …).
   - `app/swaps/[id]/swap-context-panel.tsx` — `"Your home: …"` (`:98`), `"Auto-issued on acceptance"` (`:133`, `:159`), `"Your swap is confirmed…"` (`:146`), `SWAP DETAILS` / `ORIGINAL PROPOSAL` / `PROPOSAL` / `with` / `VIEW` section labels, `← ALL SWAPS` back link.
   - `app/swaps/[id]/swap-actions.tsx` — `"Accept & insure"` (`:71`), `"Decline"` (`:76`), `"Counter offer"` / `"Cancel counter"` (`:80`), `"Withdraw"`, `"Counter from"` / `"Counter to"` (`:108`,`:121`), `"This proposal is closed."` (`:59`).
2. **Localized dates:** the swap header and listing-card date ranges render in IT format (`23 ago – 8 set`), not `Aug 23 – Sep 8`. `lib/listing-utils.ts:192 formatDateRange` currently hardcodes `"en-US"`; it must use the active locale.
3. **Localized amenity labels:** `amenityChips()` (`lib/listing-utils.ts:200`) currently returns English literals (`"Rooftop"`, `"Courtyard"`, `"Bike incl."`, `"WFH 2 desks"`, `"Dishwasher"`, `"Elevator"`, …). These must resolve to localized labels under IT.
4. **Localized property-type labels:** `propertyLabel()` (used in `components/listing/listing-card.tsx:65`) for `APARTMENT/HOUSE/LOFT/TOWNHOUSE` must resolve to IT labels.
5. Under the EN locale, all of the above continue to render the existing English copy (no regression).
6. The `swapl_locale` cookie / server resolver (`lib/i18n/server.ts`) continues to drive the locale; no new locale-resolution mechanism is introduced.
7. **Verification (per MEMORY: end-user-agent-must-render):** the swaps inbox and an open PENDING conversation must be screenshot-verified rendered in the **IT locale** showing Italian copy + Italian dates + Italian amenity chips — not merely confirmed in source.

### B.3 Data / API changes

None to the database. Date/number formatting is presentation-layer. Two pure-function utilities change signature to be locale-aware:

- `formatDateRange(fromIso, toIso, locale)` — replace the hardcoded `"en-US"` with the passed `locale` (default to active locale via the i18n layer; callers in client components pass `useLocale()`). Use `Intl.DateTimeFormat(locale, { month: "short", day: "numeric" })`.
- `amenityChips(l)` → return stable **keys** (e.g. `["rooftop","courtyard",...]`) and resolve to labels at render via `useT("amenity.rooftop")` etc., OR add `amenityChipLabels(l, t)` that maps keys→localized strings. Preferred: return keys from the util (no English in the util), localize in the component. This also removes English from the data layer per the cross-client copy-drift concern in `cx-report.md`.
- `propertyLabel(type, t)` similarly resolves via `propertyType.apartment|house|loft|townhouse` keys.

### B.4 i18n dictionary additions

Add keys (1:1 in `dict-en.ts` and `dict-it.ts`; other locale dicts may be filled later — they fall back to EN). Namespaces:

- `swaps.inbox.title`, `swaps.inbox.summary` (with `{waitingYou} {waitingThem} {active}` vars), `swaps.search`, `swaps.tab.all|hosting|traveling|archived`.
- `swaps.status.pending|active|countered|accepted|declined|withdrawn` (used by `status-pill.tsx` and `conversation-list.tsx`).
- `swaps.detail.title` (SWAP DETAILS), `swaps.detail.originalProposal`, `swaps.detail.proposal`, `swaps.detail.with`, `swaps.detail.view`, `swaps.detail.yourHome`, `swaps.detail.backAll`.
- `swaps.action.accept`, `swaps.action.decline`, `swaps.action.counter`, `swaps.action.cancelCounter`, `swaps.action.withdraw`, `swaps.action.counterFrom`, `swaps.action.counterTo`, `swaps.action.closed`.
- `amenity.balcony|rooftop|garden|courtyard|pool|piano|bikeIncl|parking|wfh|wfhDesks|petFriendly|stepFree|elevator|ac|dishwasher|washer|dryer`.
- `propertyType.apartment|house|loft|townhouse`.
- Insurance-consent strings (shared with C): see C.4.

Sample IT values: `swaps.inbox.title` → "Scambi", `swaps.action.decline` → "Rifiuta", `swaps.action.counter` → "Controproposta", `amenity.rooftop` → "Terrazza", `amenity.dishwasher` → "Lavastoviglie", `propertyType.townhouse` → "Casa a schiera".

### B.5 Affected files (B)

- `app/swaps/page.tsx`
- `app/swaps/conversation-list.tsx`
- `app/swaps/status-pill.tsx`
- `app/swaps/[id]/swap-context-panel.tsx`
- `app/swaps/[id]/swap-actions.tsx`
- `lib/listing-utils.ts` (`formatDateRange`, `amenityChips`, `propertyLabel`)
- `components/listing/listing-card.tsx` (consume localized labels)
- `components/filters/filter-sidebar.tsx` (if it renders amenity labels — verify during fix)
- `lib/i18n/dict-en.ts`, `lib/i18n/dict-it.ts`

> Several swaps files are server components and several are client (`conversation-list.tsx`, `swap-actions.tsx` use hooks/`useState`). For server components, resolve strings via the server-side `getT`/`getLocale` in `lib/i18n/server.ts`; for client components use `useT()` / `useLocale()` from `lib/i18n/client.tsx`.

---

## C — "Accept & insure" consent clarification

### C.1 User story

> As a member accepting a swap in the EU, I want it to be clear that accepting also issues an insurance policy, and I want to acknowledge that explicitly, so I'm not silently bound to a policy by a single tap.

### C.2 Acceptance criteria

1. The single primary CTA labeled `"Accept & insure"` (`app/swaps/[id]/swap-actions.tsx:71`), combined with the fine print "Auto-issued on acceptance" (`swap-context-panel.tsx:133,159`), no longer commits the user to a policy with no acknowledged step.
2. Accepting requires an explicit, acknowledged consent step. Minimum viable (chosen for this session): the accept action opens a **confirmation step** that (a) restates that accepting issues the swap insurance policy, (b) links to / inlines a short explainer of what the policy covers (property damage, third-party liability, trip interruption — already in `swap-context-panel.tsx:159`), and (c) has a clearly labelled confirm button (`"Accetta e assicura"` / localized) plus a cancel. The swap is only accepted after the user confirms this step.
3. The primary CTA label changes so the decision and the insurance are not conflated into one ambiguous verb: button reads `"Accetta lo scambio"` (Accept the swap); the insurance acknowledgement is presented in the confirm step rather than buried in the button label.
4. This also satisfies the spirit of T3 (no-confirmation-on-accept) for web by introducing the confirm step on the highest-commitment action. (T3 itself remains formally out of scope; this is a consent step, but it doubles as the accept confirmation.)
5. No insurance is issued unless the user passes the confirm step. The existing accept API behaviour (which auto-issues the policy server-side on accept) is unchanged — the consent is captured **client-side before** the accept call fires. (If product wants a persisted consent record, see C.3 note.)
6. EN locale shows equivalent English copy; no regression to the existing accept flow other than the added step.
7. Verified rendered in IT locale (screenshot of the confirm step on a PENDING proposal "waiting on you").

### C.3 Data / API changes

- **None required** for the minimum viable consent step — it is a client-side acknowledged confirmation before the existing accept POST.
- **Optional (flag for PM):** if legal wants a persisted, auditable consent record, add an `insuranceConsentAt DateTime?` / `insuranceConsentSource String?` to the accept payload and `SwapAgreement` (dual-schema rule applies — both files). Not built this session unless PM requires it; default is the non-persisted UI acknowledgement.

### C.4 i18n strings (shared namespace `insurance.consent.*`)

- `insurance.consent.cta` → "Accetta lo scambio"
- `insurance.consent.title` → "Accetti lo scambio e attivi l'assicurazione"
- `insurance.consent.body` → "Accettando, emettiamo la polizza assicurativa dello scambio: danni alla proprietà, responsabilità civile verso terzi e interruzione del viaggio, in entrambe le direzioni."
- `insurance.consent.confirm` → "Accetta e assicura"
- `insurance.consent.cancel` → "Annulla"
- `insurance.consent.learnMore` → "Cosa copre"

### C.5 Affected files (C)

- `app/swaps/[id]/swap-actions.tsx` (accept CTA label + confirm step before firing `action: "accept"`).
- `app/swaps/[id]/swap-context-panel.tsx` (explainer copy reused in the confirm step; localize the existing "Auto-issued on acceptance" lines).
- `lib/i18n/dict-en.ts`, `lib/i18n/dict-it.ts` (`insurance.consent.*`).
- (Optional, only if persisted consent is approved) `prisma/schema.prisma` + `prisma/schema.postgres.prisma` + the accept API route under `app/api/proposals/[id]/*` or `app/api/agreements/*`.

---

## Cross-cutting build & verification notes

- **Dual-schema discipline:** A's model edit is the only DB change in scope; it MUST land in both `prisma/schema.prisma` and `prisma/schema.postgres.prisma` with `context` typed `String` in both. Run `prisma generate` against the Postgres schema to confirm the prod build will typecheck.
- **Build target:** `app/` is the only fully build+test-verifiable client this session. All three sections must pass `next build`/typecheck and existing tests.
- **Rendered verification (MEMORY rule):** B and C must be screenshot-verified in the **IT locale** on the rendered mobile-width web UI (swaps inbox + an open PENDING conversation), not merely source-reviewed. A's account entry + post-swap/post-review prompts should be rendered at least once.
- **No copy drift:** keep new keys 1:1 across `dict-en.ts` and `dict-it.ts`; returning amenity/property **keys** (not English strings) from `lib/listing-utils.ts` removes English from the data layer and prevents the cross-client drift called out in `cx-report.md`.

---

## Appendix — Mobile follow-up (specified, NOT built this session)

These mirror the web work and are tracked for the iOS/Android teams; they are not part of this session's build.

### iOS (SwiftUI) — source-verified in `ios-findings.md`
- **A (rate the app):** add a "Valuta l'app" row in the Account/Support section; use `StoreKit` `requestReview()` with an App Store deep-link fallback; post structured feedback to `POST /api/app-feedback` with `source: "ios"`. (No `StoreKit`/`requestReview` exists today — F2/M1.)
- **B (i18n):** introduce a localization layer (`Localizable.xcstrings`), wrap all user-facing copy in `String(localized:)`, add the `it` localization + `CFBundleLocalizations`; localize dates (drop `Locale.ENGLISH`/`Locale.US`), amenity/property labels, and replace foreign placeholder/geo content (Istanbul → Italian cities, IT centroids) (F1, F2, F3, F23).
- **C (accept & insure consent):** gate `vm.act(.accept)` behind a `confirmationDialog` that states the insurance is issued on acceptance (today Accept fires immediately; Decline/Withdraw already confirm — F10).

### Android (Jetpack Compose) — source-verified in `android-findings.md`
- **A (rate the app):** add a "Valuta l'app" row in `AccountScreen.kt` Support section (`:274-281`) triggering Play **In-App Review** (`ReviewManagerFactory`) with a Play Store deep-link fallback; post to `POST /api/app-feedback` with `source: "android"`; consider a post-completed-swap prompt (M1).
- **B (i18n):** route every flow-screen literal through `stringResource`/`strings.xml` (only 11/91 Kotlin files do today) and fill `values-it`; localize dates/numbers (drop hardcoded `Locale.ENGLISH`/`Locale.US` in `PublicProfileScreen.kt:217,353`, `ListingDetailScreen.kt:147`) and amenity/property labels (B1, B2).
- **C (accept & insure consent):** add a confirm dialog to `accept()` in `SwapThreadScreen.kt` (`:202-219`) stating insurance is issued on acceptance, and surface `vm.error` (today accept fires with no confirm and errors are swallowed — M4).

All three clients share one backend, so the `AppFeedback` model + `POST /api/app-feedback` endpoint built in section A serves iOS and Android unchanged — only the thin native rating UI + the `source` tag differ per platform.
