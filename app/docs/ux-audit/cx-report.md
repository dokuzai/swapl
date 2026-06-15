# Swapl — Consolidated Cross-Platform CX Report

**Prepared by:** Customer Experience (senior CX specialist)
**Date:** 2026-06-15
**Launch context:** Italian market, Sept 2026. IT locale is the default end-user experience.
**Sources merged:** `web-findings.md` (rendered, IT locale, live against 1,021-listing seed), `ios-findings.md` (SwiftUI source review + rendered login), `android-findings.md` (Compose source review + rendered login), `sim-summary.json` (b1 batch: 600 users, 259 proposals, 60 accepted, 38 completed, 76 reviews).

**Method note on confidence:** Web was audited fully rendered in the IT locale. iOS and Android booted and rendered the login screen but the authenticated walkthrough could not be driven (Accessibility/AppleScript permission on iOS; emulator tap + non-root `setprop` locale limits on Android), so their deeper findings are source-verified. The single rendered screen on each mobile platform already confirmed the headline issue (English UI under IT locale), and the structural findings (no app-rating, counter-offer date reset, missing back chrome, silent actions) are directly readable in source and do not depend on a live walkthrough.

---

## Executive summary

Three clients (web, iOS, Android) share one backend and product surface, so most issues recur cross-platform. Two themes are **launch-blockers (P0)** and the brief correctly puts them front and centre:

1. **The app is not localized for its own launch market.** An Italian user gets a substantially (mobile: entirely) English product. This is the single highest-impact issue and spans all three clients plus date/number formatting and foreign placeholder/geo content.
2. **There is no way for a member to rate the app experience.** The only "review" surface rates the *other traveller*. The product team explicitly wanted members to rate "anche l'esperienza sulle app" — no model, endpoint, or UI exists on any client.

Beyond those, the **negotiation flow** (the most-used, highest-stakes journey — 259 proposals across the seed) is the weakest area on every client: accept fires without confirmation, counter-offers discard the existing dates, and actions/errors are silently swallowed. There are also several **trust-integrity** issues on iOS (fabricated ratings, hardcoded "verified" badge and fake profile stats) that are CX-critical because they erode credibility the moment a user notices them.

This report merges the raw findings into **15 cross-platform themes**, each categorized (MISSING / CLUNKY / CONFUSING / COUNTERINTUITIVE / BORING) and prioritized (P0 / P1 / P2), with a ranked P0 list for engineering at the end.

---

## Theme catalogue

Legend — **Platforms:** W = web, I = iOS, A = Android. **Category** is exactly one per theme. **Source IDs** trace each theme back to the per-platform findings.

### P0 — Launch-blockers

---

#### T1 — i18n / localization gap: the app renders in English in its Italian launch market
- **Category:** MISSING
- **Priority:** P0 (launch-blocker)
- **Platforms:** W, I, A (all three)
- **Source IDs:** W1, W4, W5 · F1, F2(date), F3(geo), F23 · B1, B2
- **Problem statement:** The product is shipping into Italy with its primary, most-used flows in English. **iOS** has no localization layer at all (no `.xcstrings`/`.strings`/`.lproj`, no `String(localized:)` anywhere). **Android** ships `values-it` with ~167 strings but only 11 of 91 Kotlin files use `stringResource` — every primary flow screen (Browse, Detail, Propose, Negotiate, Trips, Review, Profile, Publish) is hardcoded English. **Web** is partially translated but leaks English in the single most important flow — the swap inbox + negotiation (`Swap inbox`, `waiting on you`, `PENDING · HOSTING`, `SWAP DETAILS`, `ORIGINAL PROPOSAL`, `Accept & insure`, tab labels, etc.). Compounding it: dates render English-format (`Aug 23 – Sep 8` instead of `23 ago – 8 set`) and numbers force `Locale.US` (period decimal) across all clients; amenity/property chips are English on web cards; and iOS publish/geo content is foreign (Istanbul/Cihangir/Turkey placeholders, an Istanbul geo-fallback, no Italian city centroids).
- **User impact:** An Italian member perceives a product "built for someone else." It damages trust and conversion at the very top of the funnel, and the leakage is worst precisely where stakes are highest (negotiating a swap). This blocks a credible IT launch.
- **Why P0:** Italy is the launch market; this is non-negotiable for go-live and is the highest-leverage single workstream (it also fixes copy-drift between clients by centralizing strings).

---

#### T2 — No "rate the app experience" capability anywhere
- **Category:** MISSING
- **Priority:** P0 (launch-blocker, per the explicit product ask)
- **Platforms:** W, I, A (all three)
- **Source IDs:** W6 · F2 · M1
- **Problem statement:** No client offers any way for a member to rate or give feedback on the **app/product** itself. The only rating surface (`SwapReview`) is strictly traveller→traveller (rating + text about the *other person*). There is no data model, no API endpoint, no UI. iOS has no `StoreKit`/`requestReview`; Android has no Play In-App Review (`ReviewManager`); web has no app-feedback route. The product team explicitly wanted members to rate the app experience.
- **User impact:** The business is blind to product-level CSAT/NPS at exactly the moment (launch) when that signal matters most, and delighted users have no path to leave an App Store / Play Store rating to seed organic growth. A frustrated user has no in-app vent valve, so dissatisfaction goes straight to public store reviews or churn.
- **Why P0:** It is a named launch requirement, and it's the CX team's primary instrument for measuring whether everything else in this report is actually fixed. Needs a backend model + endpoint plus a thin client surface on all three platforms.

---

### P1 — Major

---

#### T3 — Accept has no confirmation while reversible actions do (backwards risk weighting)
- **Category:** COUNTERINTUITIVE
- **Priority:** P1
- **Platforms:** I, A (web: confirm pattern not flagged; verify)
- **Source IDs:** F10 · M4 (accept portion)
- **Problem statement:** Accepting a swap is the highest-commitment, hardest-to-reverse action (it creates a binding agreement / trip, and on web it silently issues insurance — see T4), yet it's the only action with **no** confirmation. On iOS, Decline and Withdraw both gate behind a `confirmationDialog`, but `Accept` fires `vm.act(.accept)` immediately on tap. Android `accept()`/`decline()` have no confirmation at all. One mistaken tap commits a swap.
- **User impact:** Accidental acceptances create real-world obligations (a stranger now expects to stay in your home), support tickets, and disputes. The risk model is inverted relative to user expectation.
- **Why P1:** High-stakes irreversible action on the core flow; the seed already has 60 accepted swaps, so this fires in production volume.

---

#### T4 — "Accept & insure" silently commits the user to an insurance policy at the accept tap
- **Category:** COUNTERINTUITIVE
- **Priority:** P1
- **Platforms:** W (verify parity on I/A)
- **Source IDs:** W2
- **Problem statement:** The web primary CTA reads `Accept & insure` and the fine print says insurance is "Auto-issued on acceptance" — so accepting silently binds the user to an insurance policy with no separate confirmation or opt-out at the decision point. Combined with T3 (no accept confirmation), a single tap both accepts the swap and issues insurance.
- **User impact:** Users commit to a policy they didn't knowingly agree to. Even if free, this is a consent/transparency problem with legal and trust implications in an EU market.
- **Why P1:** Consent and transparency around an insurance product; should be split into an acknowledged step before launch in the EU.

---

#### T5 — Counter-offer discards the proposal's existing dates
- **Category:** COUNTERINTUITIVE
- **Priority:** P1
- **Platforms:** I, A (verify web)
- **Source IDs:** F11 · M3
- **Problem statement:** When a user counters a proposal, the date pickers reset to arbitrary values instead of the live offer. iOS initializes `counterFrom`/`counterTo` to `Date()` (today); Android's `CounterDialog` initializes to `today+30 / today+37` — both ignore `proposal.dateFrom/dateTo`. A user who only wants to shift by a day must re-enter both dates from scratch, and the form often starts in an invalid state (Send disabled until `to > from`). Notably, the *Propose* dialog pre-fills correctly from availability — so this is an internal inconsistency.
- **User impact:** Negotiation friction on the most common counter ("can we move it by a few days?"); higher abandonment mid-deal and more errors. 41 COUNTERED proposals in the seed show this is a real path.
- **Why P1:** Directly throttles the negotiation conversion funnel.

---

#### T6 — Actions and errors are silently swallowed (no confirm, no success, no error surfacing)
- **Category:** CONFUSING
- **Priority:** P1
- **Platforms:** A, I (verify web)
- **Source IDs:** M4 · F10(adjacent) · m7
- **Problem statement:** On Android, `accept/decline/withdraw/counter` give no success toast and no confirmation; the only signal is a status chip silently changing after refresh. `vm.error` exists in the ViewModel but `SwapThreadScreen` never renders it — a failed accept/counter fails **silently**. Report-listing submission likewise gives no confirmation. The app inconsistently confirms some actions (log out, Keys-stay) but not the critical swap actions.
- **User impact:** Users can't tell whether a high-stakes action succeeded or failed, leading to double-taps, duplicate proposals, or believing a swap is accepted when it errored. This is the kind of ambiguity that generates support load and distrust.
- **Why P1:** Reliability/feedback gap on the core flow; pairs naturally with T3 in the same fix.

---

#### T7 — Trust-integrity: fabricated ratings, hardcoded "verified" badge, and fake profile stats
- **Category:** CONFUSING
- **Priority:** P1
- **Platforms:** I (audit-confirmed; verify W/A parity)
- **Source IDs:** F4, F19
- **Problem statement:** iOS presents invented data as if real. Listing cards synthesize a star rating from match score (`max(4.5, score/20)`, fallback `"4.8"`) and show it next to genuine listing facts. The Account profile card hardcodes `2 Trips · 1 Home · Member since 2026` for **every** user and overlays an unconditional `checkmark.shield` "verified" badge — so a brand-new, unverified, zero-trip user appears as a seasoned verified host. This directly contradicts the real, data-driven `PublicProfileView`, so the two profile surfaces disagree.
- **User impact:** The moment a user notices every home is rated 4.5–5.0, or that their own untouched profile claims trips and verification, credibility collapses. For a trust-dependent marketplace (you let a stranger into your home), this is corrosive.
- **Why P1:** Highest trust risk after localization; the real data already exists in the API, so the fix is "stop synthesizing, read the real fields."

---

#### T8 — Information architecture: "Messages" inbox opens a "Trip" screen; chat is buried, no status/action in chat
- **Category:** CONFUSING
- **Priority:** P1
- **Platforms:** I (audit-confirmed; web/Android share the inbox→thread→chat shape — verify)
- **Source IDs:** F12, F14 · (web W1 inbox labels related)
- **Problem statement:** On iOS the inbox header says "Messages," but tapping a row pushes a screen titled "Trip," and the actual chat thread is a *third* screen reached via a "Message {name}" row. A user who wants to "read my messages" lands on an itinerary and must hunt for the chat. Once in chat, there's no proposal status (pending/countered/accepted) and no accept/counter/decline affordance — so a user who agrees terms in chat must back out to a different screen to act.
- **User impact:** Naming and IA fight each other; the negotiation requires bouncing between screens, increasing drop-off at the deal-closing moment.
- **Why P1:** Structural friction on the core flow; at minimum rename for consistency and surface status/action in chat.

---

#### T9 — "List your home first" is a disabled dead-end on the Propose CTA
- **Category:** CLUNKY
- **Priority:** P1
- **Platforms:** I, A (verify web)
- **Source IDs:** M5 · F7
- **Problem statement:** When a viewer with no listing opens a home they love, the primary "Propose" CTA is a **disabled** pill ("List your home first" / "Create a listing to swap"). It is not tappable and does not route to the publish wizard; the user must discover unaided that they need to publish first via Account/Browse.
- **User impact:** This dead-ends the single most motivated moment in the funnel — a new user actively wanting to swap a specific home. The seed has 100 travellers-without-listing, i.e. exactly this cohort, hitting a wall.
- **Why P1:** Direct conversion blocker for the highest-intent new-user moment; fix is to route the CTA into the create-listing flow.

---

#### T10 — Mobile detail/sub-screens have no back affordance or title bar
- **Category:** CLUNKY
- **Priority:** P1
- **Platforms:** A (audit-confirmed; iOS uses NavigationStack titles — verify)
- **Source IDs:** M2
- **Problem statement:** On Android, no screen pushed onto a per-tab NavHost renders a `TopAppBar` with an up icon — `ListingDetail`, `SwapThread`, `SwapChat`, `TripCockpit`, `PublicProfile`, `ListingCreate` all start with a bare `Column`. The only way back is the system gesture, and deep chains (detail → host profile → their listing → host profile…) give no "where am I / go back" chrome or screen title.
- **User impact:** Users get lost in deep navigation with no visible escape, a classic disorientation/clunkiness issue that feels unfinished.
- **Why P1:** Pervasive navigation gap across all mobile detail screens; cheap to fix with a shared Scaffold/TopAppBar.

---

#### T11 — Chat is not realtime: 5s poll, no optimistic send, fragile failure handling
- **Category:** CLUNKY
- **Priority:** P1
- **Platforms:** I, A (web implies realtime — the parity gap)
- **Source IDs:** F13 · m6
- **Problem statement:** Mobile chat polls (iOS every 5s while foregrounded; Android polls) with no WebSocket/SSE and no optimistic send — a sent message appears only after the round-trip, incoming messages lag up to 5s, and on send failure the message is lost with no failed-bubble or one-tap retry (the user must retype). The web client implies realtime, so the three clients feel inconsistent.
- **User impact:** During live negotiation the chat reads as sluggish and unreliable; lost messages on a flaky connection are especially damaging mid-deal.
- **Why P1:** Perceived performance + reliability on the core flow, and a cross-client consistency gap.

---

### P2 — Polish

---

#### T12 — Decision controls and key info sit below the fold / behind accordions
- **Category:** CLUNKY
- **Priority:** P2
- **Platforms:** W (verify I/A)
- **Source IDs:** W3
- **Problem statement:** On web, for a proposal "waiting on you," the accept/counter/decline action bar sits below the chat and below a collapsible `SWAP DETAILS` accordion — the decision controls aren't above the fold.
- **User impact:** Extra scrolling/hunting to act on the very thing the screen is asking the user to act on; mild friction, not a blocker.
- **Why P2:** Layout polish on a flow that otherwise works; pin/sticky the action bar for host-actionable proposals.

---

#### T13 — Missing quick/inline actions and pull-to-refresh in inbox/trips
- **Category:** CLUNKY
- **Priority:** P2
- **Platforms:** A, I
- **Source IDs:** m4 · F15
- **Problem statement:** Inbox and Trips rows are tap-only — no swipe-to-archive, no quick Accept on a "waiting on you" row, so a user with several pending proposals must open each thread. iOS `TripsView` has no `.refreshable` and silently swallows refresh errors, keeping stale data when state changed server-side (e.g. accepted on web).
- **User impact:** Tedious for power users juggling multiple proposals; stale data causes confusion when clients diverge.
- **Why P2:** Efficiency/polish; not blocking the primary path.

---

#### T14 — Misleading or unconfirmed input controls (defaults, mislabeled filters, AI overwrite, optional-but-framed-as-protective photos, character limits)
- **Category:** CONFUSING
- **Priority:** P2
- **Platforms:** I, A, W
- **Source IDs:** m2 (filters) · F8 (AI overwrite) · F16 (baseline photos) · F17/F18 (review counter/blind-period) · F22 (silent amenity defaults) · F21 (photo cover/reorder)
- **Problem statement:** A cluster of smaller "the control doesn't mean what it shows" issues: Android filter switches labeled as preferences actually map to hard `*Required` filters with no match count; "Draft with AI" silently overwrites typed text with an easy-to-miss undo; check-in baseline photos are framed as "protects you both" but are optional and unnudged; the review sheet hides the 20-char minimum until you fall short and shows no max/blind-period context; iOS publish silently sends positive amenity defaults (`balcony/ac/washer/dishwasher=true`, `sizeSqm=80`, etc.) the host never confirmed — publishing claims about a home that may be false; and the publish wizard can't reorder photos or set a cover.
- **User impact:** Individually minor, collectively they make the product feel imprecise and occasionally make false claims on the user's behalf (the amenity defaults are the sharpest — a listing asserting a balcony/AC the host doesn't have).
- **Why P2 (with one caveat):** Mostly polish, but **F22 (silent positive amenity defaults)** borders on a trust/honesty issue — recommend defaulting unseen amenities to `false` as a fast, high-value subset even before the rest.

---

#### T15 — Boring / dead / fake-curated surfaces and flat empty states
- **Category:** BORING
- **Priority:** P2
- **Platforms:** W, I, A
- **Source IDs:** W7 · F5, F6, F20 · m1, m5
- **Problem statement:** Several surfaces feel templated, decorative, or hollow: web reviews/profile are sparse with no next-step nudges; iOS "Continue planning your {city} swap" / "Homes guests love" rails are just `prefix()` slices of the same search list (implying curation the data doesn't back), host avatars are always generated initials, and "Past trips"/"Connections" quick cards look tappable but have no destination; Android Experiences/Services tabs render empty when the affiliate catalogue is unconfigured, and empty states across Browse/Inbox/Trips/Chat are flat title-plus-grey-paragraph with no illustration or CTA (despite an unused illustration system).
- **User impact:** First impressions feel unfinished and slightly dishonest (fake curation, dead cards); empty states miss the chance to guide the user to the next action.
- **Why P2:** Engagement/polish; valuable for retention but not launch-blocking.

---

## Category roll-up

| Category | Themes |
|---|---|
| MISSING | T1 (i18n), T2 (rate-the-app) |
| COUNTERINTUITIVE | T3 (accept no-confirm), T4 (silent insurance), T5 (counter date reset) |
| CONFUSING | T6 (silent actions/errors), T7 (fabricated trust data), T8 (Messages→Trip IA), T14 (misleading controls) |
| CLUNKY | T9 (dead-end Propose CTA), T10 (no back chrome), T11 (non-realtime chat), T12 (controls below fold), T13 (no quick actions/refresh) |
| BORING | T15 (dead/fake-curated/flat surfaces) |

## Priority roll-up

| Priority | Themes |
|---|---|
| P0 (launch-blocker) | T1, T2 |
| P1 (major) | T3, T4, T5, T6, T7, T8, T9, T10, T11 |
| P2 (polish) | T12, T13, T14, T15 |

---

## Ranked P0 list — what engineering tackles first

These are the only two launch-blockers and must land before the Sept 2026 IT go-live. Ranked by sequencing value:

1. **T1 — Localize the app for the Italian market (i18n).** Highest leverage, longest lead time, all three clients.
   - **iOS:** introduce `Localizable.xcstrings`, wrap all user-facing copy, add `it` localization + `CFBundleLocalizations`.
   - **Android:** route every flow-screen literal through `stringResource`/`strings.xml` (only 11/91 files do today) and fill `values-it`.
   - **Web:** wire the swap-inbox/negotiation literals through the i18n dictionary and add the IT strings.
   - **All:** localize date (`23 ago – 8 set`), number (comma decimal), amenity/property-type labels; replace foreign placeholders/geo content (Istanbul → Italian cities, add IT centroids/country code, region-based geo fallback). Centralizing strings also kills cross-client copy drift.
   - *Start this immediately — it gates the credibility of everything else and has the biggest surface area.*

2. **T2 — Ship a "rate the app experience" capability.** Named product requirement and the CX team's measurement instrument for the launch.
   - **Backend:** add an app-feedback model + endpoint (CSAT or 1–5 + free-text comment + client tag web/ios/android), persisted separately from traveller-to-traveller `SwapReview`.
   - **Clients:** add a feedback/rating entry in the Support/Account section on all three, plus a post-positive-moment prompt (after a completed swap or a submitted review) — iOS via `requestReview()` with an App Store deep-link fallback, Android via Play `ReviewManager` with a store deep-link fallback, web via the in-app form.
   - *Build in parallel with T1; the backend piece unblocks all three clients.*

**Recommended fast-follow immediately after P0 (first P1 wave):** the negotiation-flow cluster — **T3** (accept confirmation) + **T6** (surface success/errors) shipped together, then **T5** (seed counter dates from the live proposal) and **T9** (make the Propose CTA route to publish). These four are small, high-frequency, and protect the core conversion path. Pair with **T7/F22** (stop publishing positive amenity defaults the host never confirmed) as a quick trust win.

---

## Appendix — traceability (theme → source findings)

| Theme | Web | iOS | Android |
|---|---|---|---|
| T1 i18n | W1, W4, W5 | F1, F2(date), F3, F23 | B1, B2 |
| T2 rate-the-app | W6 | F2 | M1 |
| T3 accept no-confirm | — | F10 | M4 |
| T4 silent insurance | W2 | — | — |
| T5 counter date reset | — | F11 | M3 |
| T6 silent actions/errors | — | F10(adj) | M4, m7 |
| T7 fabricated trust data | — | F4, F19 | — |
| T8 Messages→Trip IA | W1(adj) | F12, F14 | — |
| T9 dead-end Propose CTA | — | F7 | M5 |
| T10 no back chrome | — | — | M2 |
| T11 non-realtime chat | — | F13 | m6 |
| T12 controls below fold | W3 | — | — |
| T13 quick actions/refresh | — | F15 | m4 |
| T14 misleading controls | — | F8, F16, F17, F18, F21, F22 | m2 |
| T15 boring/dead/flat surfaces | W7 | F5, F6, F20 | m1, m5 |

*Cells marked "—" were not flagged on that platform; many reflect a deeper source-level walkthrough that couldn't be driven live on mobile rather than confirmed absence. Recommend confirming web parity for T3, T5, T6, T7, T8, T9 and iOS parity for T10 during fix scoping, since all three clients share one backend and product surface.*
