# Swapl iOS — End-User UX Audit

**Date:** 2026-06-15
**Scope:** iOS SwiftUI client (`ios/Swapl`), Italian-market product, IT locale.
**Method — what actually ran:** The app **built and booted successfully** in the iOS 27 Simulator (iPhone 17 Pro) against the local backend (`SWAPL_API_BASE_URL=http://localhost:3000`). The **login screen was rendered and screenshotted** (`docs/ux-audit/ios/01-launch.png`). Driving taps/typing past login required macOS Accessibility permission for AppleScript/System Events, which is not granted in this environment (and `idb` is not installed), so I could not walk the authenticated flows live. Per the time-box, I did **not** loop on that and fell back to a **careful source-level review** of every SwiftUI screen behind each flow. The single rendered screen already corroborated the most important finding (English-only UI under IT locale). Severities reflect end-user impact for an Italian audience.

---

## TOP-LINE BLOCKERS

### F1 — App is 100% hardcoded English; zero localization for an Italian-market launch
- **Flow:** All (1–9)
- **Severity:** blocker
- **Category:** MISSING feature
- **What:** There is no localization layer at all. No `.strings`/`.xcstrings`/`.lproj` resources, no `String(localized:)`/`NSLocalizedString`/`LocalizedStringKey` anywhere. Every visible string is an English literal ("Sign in", "Propose a swap", "Leave a review", "Become a host", …). Booting under `-AppleLanguages "(it)" -AppleLocale it_IT` rendered the login screen entirely in English (see screenshot). For a Sept-2026 Italy launch this is a launch blocker.
- **Where:** `ios/Swapl/Features/Auth/LoginView.swift:53-108` (and pervasively — verified: `find ios -name '*.strings' -o -name '*.xcstrings' -o -name '*.lproj'` returns nothing; `grep -r 'String(localized\|NSLocalizedString\|LocalizedStringKey'` returns nothing).
- **Fix:** Introduce a String Catalog (`Localizable.xcstrings`), wrap all user-facing copy, add `it` as a localization, and add `CFBundleLocalizations`. Prioritize the 9 audited flows. Also localize date formatting that's currently English-forced (see F2).

### F2 — No "Rate the app" / app-feedback capability exists
- **Flow:** 7 (Rate the app experience)
- **Severity:** major
- **Category:** MISSING feature
- **What:** There is no in-app App Store rating prompt and no app-feedback path. `grep` for `SKStoreReviewController` / `requestReview` / `RequestReview` / `StoreKit` returns nothing. The Account screen's "Get help" section contains only "Contact Swapl support" (a web link). Users have no way to rate the app itself — only the *other traveller* (F-review). This flow effectively does not exist.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:71-77` (only support link). No StoreKit usage anywhere.
- **Fix:** Add `import StoreKit` + `@Environment(\.requestReview)` and trigger `requestReview()` at a positive moment (e.g. after a review is submitted in `LeaveReviewSheet.submit()` or after a completed trip). Add a "Rate Swapl" row under "Get help" deep-linking to the App Store write-review URL, plus an in-app "Send feedback" entry.

---

## FLOW 1 — Browse / Discover

### F3 — Discover content is geographically foreign; no Italian cities anywhere
- **Severity:** major · **Category:** COUNTERINTUITIVE
- **What:** The map centroid table, country-code map, and all placeholders are non-Italian. The map only knows Amsterdam, Berlin, Brooklyn, CDMX, Istanbul, Lisbon, Marrakesh, Paris, Seoul, Tokyo — **no Rome/Milan/Florence** — and any unknown city silently falls back to **Istanbul** (`default: Istanbul`). The `compactCountry` code table has no Italy entry. An Italian user browsing sees a product that looks built for someone else.
- **Where:** `ios/Swapl/Features/Listings/BrowseListView.swift:910-924` (centroid table + Istanbul fallback), `:776-790` (country codes, no IT), publish placeholders `Account...View.swift:589-591` ("Istanbul", "Cihangir", "Turkey").
- **Fix:** Seed Italian city centroids, add IT to the country-code map, change the geo fallback to the user's region, and use Italian placeholder examples (e.g. "Milano", "Navigli", "Italia").

### F4 — Ratings shown to users are fabricated, not real data
- **Severity:** major · **Category:** CONFUSING
- **What:** Listing cards render a star "rating" that is invented from the match score: `String(format: "%.2f", max(4.5, Double(score)/20))`, and falls back to a hardcoded `"4.8"`. These are presented next to real listing facts as if they were genuine guest ratings. This is misleading and erodes trust once a user notices every home is 4.5–5.0.
- **Where:** `ios/Swapl/Features/Listings/BrowseListView.swift:764-769` (`ratingText`), used at `:750`.
- **Fix:** Show the real `avgRating`/`reviewsCount` from the API (the data exists — see `PublicProfileView` `stats`), or omit the star entirely when there are no reviews. Never synthesize a rating from match score.

### F5 — "Continue planning your {city} swap" / "Homes guests love" are just `prefix()` slices, not personalized
- **Severity:** minor · **Category:** BORING
- **What:** The Explore page's hero "Continue planning…" card is simply `vm.items.first`, and the two rails are `items.prefix(6)` and `items.dropFirst(3).prefix(6)`. The copy implies continuity/curation ("Homes guests love", "Available for similar dates") that the data doesn't back — it's the same search list re-sliced, with overlap between the two rails.
- **Where:** `ios/Swapl/Features/Listings/BrowseListView.swift:284-288`.
- **Fix:** Either wire these to real recommendation/continue-where-you-left-off endpoints, or relabel honestly (e.g. "Recently added").

---

## FLOW 2 — Listing detail

### F6 — Host avatar is always a generated initial; no real host photo
- **Severity:** minor · **Category:** BORING
- **What:** The host block draws a solid circle with the first letter of the host name, never the host's actual avatar even when one exists. Combined with the always-on verified styling elsewhere, the detail page feels templated.
- **Where:** `ios/Swapl/Features/Listings/ListingDetailView.swift:334-343`.
- **Fix:** Render the host's profile photo via `AsyncImage` with the initial tile as fallback.

### F7 — "Propose" is disabled with no explanation of how to fix it
- **Severity:** minor · **Category:** CONFUSING
- **What:** When the viewer has no listing, "Propose" is dimmed (opacity 0.45) and disabled. The only hint is small grey text "Create a listing to swap" in the row above — easy to miss, and tapping the dimmed button does nothing (no nudge to the create-listing flow).
- **Where:** `ios/Swapl/Features/Listings/ListingDetailView.swift:455-488`.
- **Fix:** Keep the button tappable but route it to the create-listing wizard with an explanatory sheet ("Publish your home to start swapping"), instead of a dead disabled control.

---

## FLOW 3 — Send a swap proposal + message

### F8 — "Draft with AI" can silently overwrite typed text (undo is easy to miss)
- **Severity:** minor · **Category:** COUNTERINTUITIVE
- **What:** Tapping "Draft with AI" replaces whatever the user already typed. There is a one-step "Undo", but it appears as a small borderless secondary button next to the draft button and is easy to overlook; the replacement happens with no confirmation.
- **Where:** `ios/Swapl/Features/Listings/ListingDetailView.swift:662-685` (replace), `:632-645` (undo).
- **Fix:** When the composer is non-empty, ask before replacing, or insert/append rather than overwrite.

### F9 — Proposal "Send" has no success affordance inside the sheet; relies on an alert two layers up
- **Severity:** minor · **Category:** CLUNKY
- **What:** On send, the sheet closes and an alert "Proposal sent — You can follow the conversation from Messages" fires on the listing detail. The handoff to the actual thread requires the user to leave, switch to the Messages tab, and find it. There's no "Open conversation" CTA.
- **Where:** `ios/Swapl/Features/Listings/ListingDetailView.swift:136-140`.
- **Fix:** Replace the bare OK alert with a confirmation that offers "View conversation" deep-linking straight into the thread.

---

## FLOW 4 — Reply / counter / accept (negotiation) — most problematic area

### F10 — Accept has NO confirmation, but Decline and Withdraw do — backwards risk weighting
- **Severity:** major · **Category:** COUNTERINTUITIVE
- **What:** "Accept swap" fires `vm.act(.accept)` immediately on tap. Meanwhile Decline and Withdraw both gate behind a `confirmationDialog`. Accepting is the *higher-commitment, harder-to-reverse* action (it creates a binding agreement / trip), yet it's the only one with no guard. One mistaken tap accepts a swap.
- **Where:** `ios/Swapl/Features/Swaps/SwapsInboxView.swift:626` (accept, no confirm) vs `:399-410` (decline/withdraw confirmations).
- **Fix:** Add a confirmation dialog to Accept summarizing the dates and both homes before committing.

### F11 — Counter-offer date pickers default to *today*, discarding the existing proposed dates
- **Severity:** major · **Category:** CLUNKY
- **What:** `counterFrom`/`counterTo` are initialized to `Date()` (today) and are never seeded from the proposal's current dates. To counter, the user must re-enter both dates from scratch even if they only want to shift by a day. The Send button is also disabled until `counterTo > counterFrom`, so an untouched form starts in an invalid state.
- **Where:** `ios/Swapl/Features/Swaps/SwapsInboxView.swift:321-323` (init to today), counter sheet `:639-669`.
- **Fix:** Pre-fill `counterFrom`/`counterTo` from `detail.proposal.dateFrom/dateTo` when opening the sheet, and optionally show the original dates for reference.

### F12 — The inbox is called "Messages" but every row opens a screen titled "Trip"; the actual chat is buried two levels deep
- **Severity:** major · **Category:** CONFUSING
- **What:** The tab/inbox header says "Messages" (`SwapsInboxView`), but tapping a conversation pushes `ProposalDetailView` whose navigation title is "Trip". The real message thread (`SwapChatView`) is a *third* screen reached via a "Message {name}" row inside the Trip screen. A user expecting to "read my messages" lands on a trip itinerary instead, and must hunt for the chat. Naming and information architecture fight each other.
- **Where:** `ios/Swapl/Features/Swaps/SwapsInboxView.swift:89-91` + `:386` (title "Trip"), chat entry `:535-563`.
- **Fix:** Either rename the inbox to "Proposals/Trips", or surface the chat directly from the inbox row and demote the itinerary. At minimum, title the detail screen consistently with the inbox.

### F13 — Chat is a 5-second foreground poll with no realtime/optimistic send — feels laggy vs. web/Android expectations
- **Severity:** major · **Category:** CLUNKY
- **What:** `SwapChatView` has no WebSocket/SSE; it polls every 5s while foregrounded (`pollLoop` sleeps 5s) and stops when backgrounded. Sent messages are not shown optimistically — the bubble appears only after the round-trip resolves. Incoming messages can lag up to 5s. There are no typing indicators and no delivery state beyond a read-receipt check that only flips on the next poll. For a negotiation chat this reads as sluggish and inconsistent with a realtime web client.
- **Where:** `ios/Swapl/Features/Swaps/SwapChatView.swift:78-104` (send/merge), `:322-331` (5s poll loop).
- **Fix:** Add optimistic send (insert a pending bubble immediately, reconcile on response), shorten/adapt the poll cadence or move to SSE/WebSocket to match the web client, and surface a "sending/failed/retry" state.

### F14 — No proposal/agreement status or accept-action inside the chat thread itself
- **Severity:** minor · **Category:** CONFUSING
- **What:** Once in `SwapChatView` you cannot see the proposal status (pending/countered/accepted) or take accept/counter/decline action — those live only on the separate Trip screen. A user negotiating in chat ("ok, those dates work") has to back out to a different screen to actually act on it.
- **Where:** `ios/Swapl/Features/Swaps/SwapChatView.swift` (no status/action UI); actions only in `SwapsInboxView.swift:611-637`.
- **Fix:** Add a sticky status header + inline accept/counter affordance to the chat, or a system-message card when a counter is proposed.

---

## FLOW 5 — Check-in / check-out & trip

### F15 — Trips refresh has no pull-to-refresh and silently swallows errors
- **Severity:** minor · **Category:** CLUNKY
- **What:** `TripsView` loads once on appear; there's no `.refreshable`. On a failed refresh it keeps stale data and discards the error (only sets it if `trips == nil`). If a trip's state changed server-side (e.g. it got accepted on web), the user has no obvious way to pull fresh data.
- **Where:** `ios/Swapl/Features/Trips/TripsView.swift:17-27`, `:58-71` (no refreshable).
- **Fix:** Add `.refreshable { await vm.load() }` and surface a non-blocking refresh-failed toast.

### F16 — Check-in/out baseline photos are optional and unenforced despite "protects you both" framing
- **Severity:** minor · **Category:** CONFUSING
- **What:** `CheckEventSheet` tells the user baseline photos "protect you both if anything's queried later," but the submit button is enabled with zero photos and no note. The protective framing implies they matter; nothing nudges the user to actually add any.
- **Where:** `ios/Swapl/Features/Trips/CheckEventSheet.swift:24-29`, submit `:96-101` (only disabled while `uploading`).
- **Fix:** Either soft-require at least one photo (with an explicit "skip" choice and a logged consequence), or reword to not over-promise.

---

## FLOW 6 — Leave a review of the other traveller

### F17 — Review sheet shows no character counter until you're already under the limit; min-20 rule is a surprise
- **Severity:** minor · **Category:** CLUNKY
- **What:** The 20-char minimum only surfaces *after* you start typing and fall short ("At least 20 characters — N so far"). Before typing there's no indication of a minimum, and the Submit button is just disabled with no reason. No max counter near 1000 either.
- **Where:** `ios/Swapl/Features/Swaps/LeaveReviewSheet.swift:20`, `:72-76`.
- **Fix:** Always show a live "N/20 min" counter and explain why Submit is disabled.

### F18 — One-directional review with no mutual-review/blind-period context
- **Severity:** minor · **Category:** CONFUSING
- **What:** The sheet asks the user to review the partner, but gives no sense of whether the partner has reviewed them, whether reviews are revealed simultaneously (blind), or a deadline. For a reciprocal home-swap this context materially changes what people write.
- **Where:** `ios/Swapl/Features/Swaps/LeaveReviewSheet.swift:26-29`.
- **Fix:** Add a one-line explainer ("Reviews are revealed once you've both written one" or the actual policy) and surface whether the other party has submitted.

---

## FLOW 7 — Rate the app experience
Covered by **F2** (blocker-adjacent MISSING feature). Restating: there is no rate-the-app and no app-feedback path anywhere in the client.

---

## FLOW 8 — Profile & reviews received

### F19 — Your own profile card shows hardcoded, fake stats and an unconditional "verified" badge
- **Severity:** major · **Category:** CONFUSING
- **What:** The Account profile card hardcodes `"2" Trips`, `"1" Home`, `"2026" Member since` for every user regardless of reality, and always overlays a `checkmark.shield.fill` "verified" badge on the avatar unconditionally. So a brand-new, unverified user with zero trips sees "2 Trips · 1 Home · verified." This directly contradicts the *real*, data-driven `PublicProfileView` (which correctly shows `swapsCompleted`, `reviewsCount`, "ID verified" only when verified, and "No reviews yet"). The two profile surfaces disagree.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:200-204` (hardcoded stats), `:182-187` (unconditional shield badge). Contrast `ios/Swapl/Features/Profile/PublicProfileView.swift:89,100,148-156,251-252` (real data).
- **Fix:** Drive the Account card from the same profile/stats endpoint as `PublicProfileView`; gate the verified badge on actual verification status.

### F20 — "Past trips" and "Connections" quick cards are decorative (no destination)
- **Severity:** minor · **Category:** BORING
- **What:** The two prominent quick cards ("Past trips — Your completed swaps", "Connections — Hosts you know") are plain `ProfileFeatureCard` views with no `NavigationLink`/action — they look tappable but do nothing.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:217-222`, `ProfileFeatureCard:403-433` (no action param).
- **Fix:** Wire them to real destinations or remove them.

---

## FLOW 9 — Publish a home

### F21 — Publish wizard cannot reorder photos or set a cover; no per-step validation feedback location
- **Severity:** minor · **Category:** CLUNKY
- **What:** Photos can be added/removed but not reordered, and the first-uploaded becomes the de-facto cover with no way to choose. For a home-swap listing where the lead photo drives clicks, this is a real limitation.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:630-689` (photosSection — add/remove only).
- **Fix:** Allow drag-to-reorder and an explicit "Set as cover".

### F22 — Many listing attributes silently keep create-time defaults (no UI), shaping the listing without the host's knowledge
- **Severity:** minor · **Category:** CONFUSING
- **What:** The wizard exposes only a subset of fields. On *create*, fields like `wfhSetup=true`, `balcony=true`, `ac=true`, `washer=true`, `dishwasher=true`, `sizeSqm=80`, `sleeps=3`, `minStayDays=7`, `maxStayDays=30` are silently sent as defaults the host never saw or confirmed. A host with no balcony/AC publishes a listing claiming both.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:954-982` (`ListingCreationDraft` defaults), amenities step only toggles a subset `:607-618`.
- **Fix:** Default unseen amenities to `false`, or expose them in the wizard; never publish positive amenity claims the host didn't make.

### F23 — Publish placeholders/examples are foreign (Istanbul/Cihangir/Turkey)
- **Severity:** minor · **Category:** COUNTERINTUITIVE
- **What:** First impression of the create flow for an Italian host is Turkish example data.
- **Where:** `ios/Swapl/Features/Profile/AccountView.swift:589-591`.
- **Fix:** Localize examples to Italian cities/neighbourhoods.

---

## Cross-cutting / consistency notes
- **Web/Android parity:** The chat lacks realtime that the web client implies (F13); the message thread is buried under a "Trip" screen (F12); own-profile stats diverge from the public profile and presumably from web (F19). These are the message-sync/consistency concerns called out in the brief.
- **Honesty of data:** Synthesized ratings (F4), hardcoded profile stats (F19), and unconditional verified badge (F19) are the highest-trust-risk items after localization.
- **Dead/boring screens:** Decorative non-tappable quick cards (F20), generated-initial host/avatars (F6), re-sliced "curated" rails (F5).

## Priority order
1. **F1** localization (blocker for IT launch)
2. **F2** rate-the-app / feedback (missing flow)
3. **F10** accept-without-confirmation, **F11** counter dates reset, **F12** Messages→Trip IA — the negotiation flow
4. **F19** fake profile stats + unconditional verified badge, **F4** fabricated ratings (trust)
5. **F13** chat realtime/optimistic send
6. Remainder (minor polish).
