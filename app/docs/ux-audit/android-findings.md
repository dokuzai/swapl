# Swapl Android — End-User UX Audit

**Method:** Build + emulator boot **SUCCEEDED**, then partial render + source review.

- `./gradlew :app:assembleDebug` built cleanly (exit 0) using Android Studio's bundled JBR (no system Java on PATH). Debug APK produced and installed on a Pixel_10_Pro AVD (cold boot — the saved snapshot was version-incompatible).
- The app **launches and renders correctly** — the login screen ("Keys for keys.") renders with the right Fraunces/Inter typography and cream/pink palette (screenshot `docs/ux-audit/android/01-launch.png`). Build, install, launch and Compose rendering are all confirmed working.
- I could **not complete the in-app walkthrough**: (1) emulator coordinate-tap input was unreliable in this headless session — text repeatedly landed in the wrong field and button taps missed after keyboard layout shifts (an emulator-automation limitation, *not* an app bug); (2) the **IT locale would not apply** via `setprop` on a non-rooted user build, so I could not render the Italian UI. Per the time-box instruction I stopped fighting the emulator and completed a careful **source-level review** of every flow's Compose screen + ViewModel.
- Screenshots captured: `docs/ux-audit/android/01-launch.png` … `03-home.png` (login screens only).

The most consequential findings below (localization, no "rate the app", no back affordance, counter-offer flow) are all verifiable directly in source and do not depend on the live walkthrough.

---

## BLOCKERS

### B1 — Core flows are hardcoded English; Italian (and all 7 locales) never render
- **Flow:** All (Browse, Detail, Propose, Negotiate, Trips, Review, Profile, Publish)
- **Severity:** blocker · **Category:** MISSING feature
- The repo ships `values-it/strings.xml` (+ de/es/fr/nl/pt/tr) with ~167 strings, but **only 11 of 91 Kotlin files use `stringResource`**. Every primary flow screen uses hardcoded English literals: `BrowseScreen.kt` ("Browse", "Where to?", "Filters", "Show homes"), `ListingDetailScreen.kt` ("Propose a swap", "What this place offers", "Stay with points"), `ProposeSwapDialog.kt` ("Propose a swap", "Send", "Write it for me"), `SwapThreadScreen.kt` ("Accept swap", "Counter-offer", "Decline"), `LeaveReviewDialog.kt`, `TripsScreen.kt`, `SwapsInboxScreen.kt`, `AccountScreen.kt`, `PublicProfileScreen.kt`, `TripCockpit.kt` (partial). For an Italian-market launch this is a blocker: an IT user sees an almost entirely English app.
- **Files:** `features/listings/BrowseScreen.kt:109,129,275,317`; `features/listings/ListingDetailScreen.kt:184,187,230,252,324`; `features/listings/ProposeSwapDialog.kt:123,145,162`; `features/swaps/SwapThreadScreen.kt:210-216`; `features/swaps/LeaveReviewDialog.kt:55,103`; `features/trips/TripsScreen.kt:93,217`; `features/profile/AccountScreen.kt:165,247-280`
- **Fix:** Move every user-facing literal in the flow screens into `strings.xml` / `stringResource(...)` and fill `values-it`. This is the single highest-impact change for the IT launch.

### B2 — Dates/months/numbers force English locale even after B1
- **Flow:** Listing detail, Review, Profile
- **Severity:** blocker (post-B1) · **Category:** CONFUSING
- `PublicProfileScreen.kt:353` formats review months with `Locale.ENGLISH` ("Jan 2026"); `reviewsValue` at `:217` uses `Locale.US` for the rating decimal. Italian users expect "gen 2026" and a comma decimal. `ListingDetailScreen.kt:147` shows raw ISO `2026-06-15` rather than a localized `15 giu 2026`.
- **Files:** `features/profile/PublicProfileScreen.kt:217,353`; `features/listings/ListingDetailScreen.kt:147`
- **Fix:** Use the device locale for `DateTimeFormatter`/number formatting; drop the hardcoded `Locale.ENGLISH`/`Locale.US`.

---

## MAJOR

### M1 — There is NO "rate the app" capability anywhere
- **Flow:** Rate the app experience (flow 7)
- **Severity:** major · **Category:** MISSING feature
- Confirmed by reading `AccountScreen.kt` (the only Support section: "Get help", "Privacy policy", "Terms of service", "Log out") and by grepping the whole source tree: no Play **In-App Review** (`ReviewManager`/`com.google.android.play:review`), no "Rate us", no "Send feedback", no NPS prompt. The only "review/rating" surfaces are home-swap reviews of *other travellers*. A user delighted (or furious) after a swap has no in-app path to rate the app or leave Play Store feedback.
- **Files:** `features/profile/AccountScreen.kt:274-281` (Support section, where it belongs)
- **Fix:** Add a "Valuta l'app" row in the Support section that triggers `ReviewManagerFactory` in-app review (with a Play Store deep-link fallback), and consider a post-completed-swap prompt.

### M2 — Detail/sub screens have no back button or title bar
- **Flow:** Listing detail, Swap thread, Chat, Trip detail, Public profile, Publish
- **Severity:** major · **Category:** CLUNKY / CONFUSING
- No screen pushed onto a per-tab NavHost renders a `TopAppBar` with a navigation/up icon. `ListingDetailScreen`, `SwapThreadScreen`, `SwapChatScreen`, `TripCockpit`/`TripDetailScreen`, `PublicProfileScreen`, `ListingCreateScreen` all start with a bare `Column`. The user can only retreat via the system back gesture, and deep screens (e.g. detail → host profile → their listing → host profile…) have no visible "where am I / go back" chrome. There is also no screen title at the top of the listing detail (the listing title doubles as it, but chat/thread/profile have none).
- **Files:** `features/listings/ListingDetailScreen.kt:113`; `features/swaps/SwapThreadScreen.kt:103`; `features/swaps/SwapChatScreen.kt:376`; `features/profile/PublicProfileScreen.kt:98`; `MainActivity.kt:261-331` (NavHost destinations created without a Scaffold/TopAppBar)
- **Fix:** Wrap detail destinations in a `Scaffold` with a `TopAppBar` carrying a back arrow + title, or add a shared back affordance in the nav graph.

### M3 — Counter-offer flow is counterintuitive: it discards the original dates
- **Flow:** Reply / counter / accept a proposal
- **Severity:** major · **Category:** COUNTERINTUITIVE
- In `SwapThreadScreen.kt` the `CounterDialog` (`:222`) initializes its From/To to `today+30 / today+37` — **ignoring the dates already on the proposal** (`d.proposal.dateFrom/dateTo`). A user countering "can we shift by 3 days?" is dropped onto arbitrary dates a month out and must re-enter everything. The `ProposeSwapDialog` correctly pre-fills from availability, so this is an inconsistency within the same app.
- **File:** `features/swaps/SwapThreadScreen.kt:222-227`
- **Fix:** Seed `CounterDialog`'s From/To from the current proposal's (or counter's) dates so a counter starts from the live offer.

### M4 — Counter-offer and Accept give no confirmation or feedback
- **Flow:** Reply / counter / accept
- **Severity:** major · **Category:** CONFUSING
- `ActionRow` calls `vm.accept()/decline()/withdraw()/counter()` directly. `accept()`/`decline()` have **no confirmation dialog** (one mistap declines a swap irreversibly) and **no success toast** — the only signal is the `TagChip(status)` silently changing after a refresh. `vm.error` is held in the ViewModel (`:54`) but `SwapThreadScreen` **never renders it**, so a failed accept/counter fails silently. Contrast with `AccountScreen` which does confirm log-out and `ListingDetailScreen` which shows a "Request sent" dialog for Keys stays.
- **Files:** `features/swaps/SwapThreadScreen.kt:202-219` (no confirm, error never shown); VM error at `:54,87`
- **Fix:** Add a confirm dialog for Decline/Withdraw, surface `vm.error` inline, and show a brief success state after accept/counter.

### M5 — "Propose a swap" requires you to already own a listing, with a dead-end CTA
- **Flow:** Send a swap proposal
- **Severity:** major · **Category:** CLUNKY
- In `ListingDetailScreen.kt` `ProposeCta` (`:312`), if the viewer has no listing the primary button is a **disabled** "List your home first" pill with helper text — but it is not tappable and does not route to the publish flow. A motivated new user staring at a home they love has to discover, unaided, that they must go to Account/Browse to publish first.
- **File:** `features/listings/ListingDetailScreen.kt:314-322`
- **Fix:** Make the CTA actionable — route directly to the "List a home" wizard (`onBecomeHost`/`new`) instead of a disabled dead-end.

---

## MINOR

### m1 — Browse "Experiences"/"Services" tabs may be empty/affiliate filler
- **Flow:** Browse / discover · **Severity:** minor · **Category:** BORING/CONFUSING
- `BrowseScreen.kt:180-181` swaps the whole list for `ExperiencesTab()`/`ServicesTab()` (env-gated affiliate catalogue). If the affiliate env isn't configured these top-level tabs likely render empty, presenting two prominent dead tabs next to the real "Homes". The "Get Inspired" banner is also Homes-only, so switching tabs silently removes it.
- **File:** `features/listings/BrowseScreen.kt:159-181`
- **Fix:** Hide Experiences/Services chips when the catalogue is empty/unconfigured, or show a clear "coming soon" state.

### m2 — Filter sheet: amenity toggles labeled as requirements, no result count
- **Flow:** Browse / discover · **Severity:** minor · **Category:** CONFUSING
- `FilterSheet` labels switches "Pets welcome / Work-from-home setup / Step-free access" but they map to `petsRequired/wfhRequired/stepFreeRequired` (`:303-305`) — i.e. they're hard *filters*, not preferences, which isn't obvious. The "Show homes" button gives no live count of how many homes match.
- **File:** `features/listings/BrowseScreen.kt:303-333`
- **Fix:** Clarify these are required filters (e.g. "Only step-free homes") and/or show a match count on the apply button.

### m3 — Proposal/Counter dialogs are cramped AlertDialogs, not sheets
- **Flow:** Propose / counter · **Severity:** minor · **Category:** CLUNKY
- `ProposeSwapDialog` and `CounterDialog` are `AlertDialog`s containing two date fields + a multi-line message + an AI-draft button. On a phone with the keyboard up this is tight and can clip. The rest of the app uses `ModalBottomSheet` for comparable input (filters, check-in/out).
- **Files:** `features/listings/ProposeSwapDialog.kt:121`; `features/swaps/SwapThreadScreen.kt:228`
- **Fix:** Promote these to `ModalBottomSheet` for consistency and room.

### m4 — Inbox/Trips lack swipe or quick actions; everything is tap-through
- **Flow:** Negotiate / trip · **Severity:** minor · **Category:** CLUNKY
- `SwapsInboxScreen` and `TripsScreen` rows are tap-only; no swipe-to-archive, no quick Accept on a "Waiting on you" row. A user with several pending proposals must open each thread to act.
- **Files:** `features/swaps/SwapsInboxScreen.kt:209`; `features/trips/TripsScreen.kt:158`
- **Fix:** Add a quick "Accept" / "Decline" action on `waitingOnYou` inbox rows.

### m5 — Empty states are wordy and flat (no illustration/CTA)
- **Flow:** Browse, Inbox, Trips, Chat · **Severity:** minor · **Category:** BORING
- The `EmptyState`/`ErrorState` composables are title + grey paragraph with no illustration and (except chat retry) no CTA. The app *has* a `CityIllust`/illustration system, unused here. e.g. `TripsScreen.kt:211` "No trips yet" could deep-link to Browse.
- **Files:** `features/listings/BrowseScreen.kt:386`; `features/swaps/SwapsInboxScreen.kt:269`; `features/trips/TripsScreen.kt:211`
- **Fix:** Add an illustration + an action button (e.g. "Browse homes") to the key empty states.

### m6 — Chat send-failure leaves the message lost; no retry, no optimistic bubble
- **Flow:** Send proposal + message / negotiate · **Severity:** minor · **Category:** CLUNKY
- `SwapChatScreen` `send()` clears the composer only on success, but on failure it just sets `sendError` text — there's no failed-message bubble and no one-tap retry; the user must retype. There's also no optimistic "sending" bubble, so on a slow link the message appears to vanish until the round-trip returns.
- **File:** `features/swaps/SwapChatScreen.kt:260-275`
- **Fix:** Show an optimistic pending bubble with a retry affordance on failure.

### m7 — Report-listing CTA shows on the host's own listing path inconsistently / no success feedback
- **Flow:** Listing detail · **Severity:** minor · **Category:** CONFUSING
- "Report this listing" (`ListingDetailScreen.kt:260`) opens `ReportDialog` but there's no visible confirmation after submitting from this screen, mirroring the silent-action pattern in M4.
- **File:** `features/listings/ListingDetailScreen.kt:260`
- **Fix:** Confirm submission with a snackbar/toast.

---

## Cross-client consistency notes (web / iOS / android)
- **Copy drift risk:** because the Android flows are hardcoded English literals (B1) while iOS/web have their own copy, the three clients will diverge in wording over time (e.g. Android "Stay with points" vs iOS "Stay with Keys" wording). The codebase even comments the Keys/points naming carefully — centralizing strings (B1) also fixes drift.
- **Pattern inconsistency within Android:** Propose pre-fills dates but Counter does not (M3); some actions confirm (log out, Keys-stay) while accept/decline/report do not (M4, m7); some inputs are sheets, some are dialogs (m3). Tightening these to one pattern would make the app feel more coherent.
- **What's good (parity is solid):** chat has read receipts + photo attach + polling, the trip cockpit (phase timeline, key codes, insurance/on-chain badge, check-in/out with baseline photos), the People panel, the review flow (stars + 20–1000 char validation matching the API), and public-profile stats all mirror the web/iOS feature set well. The review-the-other-traveller flow (flow 6) is complete and correct. The check-in/out flow (flow 5) is solid.

## Summary table
| # | Flow | Severity | Category | One-liner |
|---|------|----------|----------|-----------|
| B1 | All | blocker | MISSING | Core flows hardcoded English; IT/7 locales never render |
| B2 | Detail/Review/Profile | blocker | CONFUSING | Dates/months/numbers forced to English locale |
| M1 | Rate the app | major | MISSING | No in-app review / "rate the app" anywhere |
| M2 | All detail screens | major | CLUNKY | No back button / title bar on pushed screens |
| M3 | Counter | major | COUNTERINTUITIVE | Counter dialog discards the proposal's dates |
| M4 | Accept/counter | major | CONFUSING | No confirm + errors silently swallowed |
| M5 | Propose | major | CLUNKY | "List your home first" is a disabled dead-end |
| m1 | Browse | minor | BORING | Empty/unconfigured Experiences & Services tabs |
| m2 | Browse filters | minor | CONFUSING | "Required" amenity filters mislabeled; no count |
| m3 | Propose/counter | minor | CLUNKY | Cramped AlertDialogs vs sheets |
| m4 | Inbox/Trips | minor | CLUNKY | No quick/swipe actions |
| m5 | Empty states | minor | BORING | Flat, wordy, no illustration/CTA |
| m6 | Chat | minor | CLUNKY | Send failure loses message; no retry/optimistic |
| m7 | Report listing | minor | CONFUSING | No success feedback after report |
