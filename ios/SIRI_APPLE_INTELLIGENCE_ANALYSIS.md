# Swapl × Siri / Apple Intelligence — Integration Analysis (iOS 26 / iOS 27)

_Researched June 2026, right after WWDC 2026. Grounded in the current `ios/Swapl` codebase._

---

## 0. TL;DR — the strategic verdict

1. **There is no "travel / marketplace / booking" assistant-schema domain.** Apple's schema domains (the things you adopt with `@AssistantIntent(schema:)`) are: `camera`, `clock`, `file-management`, `mail`, `navigation`, `messaging`, `notes` (Siri-discoverable) + `books`, `browser`, `journal`, `presentation`, `documents`, `spreadsheets` (Shortcuts-only). None fit "find/accept a home swap." → **You build _custom_ App Intents, not schema-conforming ones.**
2. **That used to be a dead end. As of iOS 27 it isn't.** WWDC 2026's Gemini-backed Siri can invoke **custom App Intents through natural language** — it no longer requires the user to speak your exact `AppShortcutsProvider` phrase. Your job is to model your content as **`IndexedEntity`** App Entities and expose clean intents; Siri's LLM does the matching. (Session: _Build intelligent Siri experiences with App Schemas_, WWDC26 240.)
3. **All four of your example commands are buildable**, each mapping to a different Apple pillar:
   - "Find me a home exchange for next week" → **custom `FindSwapIntent` + `IndexedEntity` semantic search + interactive snippet**.
   - "Accept that swap from the Brazilian family" → **onscreen awareness (`appEntityIdentifier`) + custom `AcceptSwapIntent(ProposalEntity)`**.
   - "List this apartment from my photos" → **Visual Intelligence (`IntentValueQuery`) + Foundation Models multimodal extraction → prefilled draft**.
   - "Homeswap options for my summer holiday (from calendar)" → **EventKit date resolution feeding `FindSwapIntent`**.
4. **Deployment-target reality:** you ship `IPHONEOS_DEPLOYMENT_TARGET = 17.0`. Everything modern here (IndexedEntity, Foundation Models, Visual Intelligence, App Schemas, interactive snippets) is **iOS 26+**, and the advanced bits (SyncableEntity, LongRunningIntent, the Gemini-Siri NL matching) are **iOS 27+**. So all new work is `@available(iOS 26/27, *)`-gated and additive. Your two existing intents (`CreateListingIntent`, `OptimizeListingPhotosIntent`) keep working on 17+.
5. **SiriKit is now formally deprecated** (WWDC26). You never adopted it — good. App Intents is the only forward path, and you're already on it.

---

## 1. What actually shipped — the platform timeline

### iOS 26 (Sept 2025) — the foundation you can use today
| Capability | API | What it does |
|---|---|---|
| **Foundation Models** | `FoundationModels`, `@Generable`, `@Guide`, `LanguageModelSession` | On-device LLM (the one behind Apple Intelligence). Type-safe **structured output as Swift structs** via guided generation. **Multimodal** — accepts images + text. Free, offline, private. |
| **Visual Intelligence + App Intents** | `IntentValueQuery`, `SemanticContentDescriptor` | Camera/screenshot → system hands your app detected **labels + a pixel buffer**; you return matching `AppEntity`s into the Visual Intelligence UI. |
| **Interactive Snippets** | `SnippetIntent`, `ShowsSnippetView`, `.reload()` | Rich, _refreshable_ SwiftUI cards as intent results — confirm/act inline without opening the app. |
| **Deferred properties** | `@DeferredProperty` | Async-computed entity properties; lazy-load heavy fields (e.g. full listing detail) from your backend only when needed. |
| **Semantic entity search** | `IndexedEntity` (+ `@Property(indexingKey:)`) | Index entity content into Spotlight; enables **semantic** ("homes near the beach") not just string matching, and content Q&A. |

### iOS 27 (Sept 2026, announced WWDC 2026) — the leap
| Capability | API / change | Why it matters for Swapl |
|---|---|---|
| **Gemini-powered Siri** | (platform) | Conversational, multi-turn, **can call custom App Intents via NL** — no exact-phrase requirement. Standalone Siri app + in-context. |
| **Onscreen awareness** | `.appEntityIdentifier(_:)` view modifier | Siri knows which of your entities is on screen → "accept _that_ one", "message _them_". |
| **`SyncableEntity`** | `SyncableEntity`, `SyncableEntityIdentifier<Local, Stable>` | Stable IDs (your server UUIDs) so a Siri conversation about a listing continues across iPhone/iPad/Mac. |
| **`LongRunningIntent`** | `performBackgroundTask{}onCancel:{}`, progress as Live Activity | Multi-photo upload + AI listing generation can exceed 30s and show progress. |
| **`CancellableIntent`** | `onCancel` | Cleanly abort a half-finished upload. |
| **`EntityCollection<T>`** | parameter type | Pass 100s of photo IDs without resolving them all — "nearly instant." |
| **`@UnionValue`** | macro | One Visual-Intelligence query returning **multiple** entity types (a `Listing` _or_ a `Place`). |
| **Richer param types** | `Duration`, `PersonNameComponents` | Native pickers + Siri understanding for "the Brazilian family" (person name) and stay length. |
| **`ValueRepresentation` / `Transferable`** | `IntentValueRepresentation(exporting:/importing:)` | Export a listing as a `PlaceDescriptor` → "navigate there" in Maps; import shared content into Swapl. |

> Note on Gemini: Apple stated _"data is only used to execute your request."_ For privacy-sensitive extraction (reading a user's photos to build a listing), prefer **on-device Foundation Models**, not the cloud Siri model. Use the right model per task (see §6).

---

## 2. The four capability pillars, mapped to Apple tech

```
                       ┌─────────────────────────────────────────────┐
  USER INTENT          │            APPLE PLATFORM PILLAR             │   SWAPL PIECE
─────────────────────  ┼─────────────────────────────────────────────┼────────────────────────
 "Find a swap…"        │ Custom AppIntent + IndexedEntity (semantic)  │ FindSwapIntent + ListingEntity
 "…for next week"      │ Foundation Models / system date resolution   │ NL → date range
 "…from my calendar"   │ EventKit (EKEventStore)                       │ trip dates → filter
─────────────────────  ┼─────────────────────────────────────────────┼────────────────────────
 "Accept that one"     │ Onscreen awareness (appEntityIdentifier)     │ ProposalEntity row tagging
 "…from the Brazilian  │ EntityStringQuery + PersonNameComponents     │ resolve name → proposal
  family"              │ Interactive snippet (confirm inline)         │ AcceptSwapIntent
─────────────────────  ┼─────────────────────────────────────────────┼────────────────────────
 "List this apartment  │ Visual Intelligence (IntentValueQuery)       │ photo → listing draft
  from these photos"   │ Foundation Models (multimodal @Generable)    │ ExtractedListingInfo++
 (location + photos)   │ CoreLocation / photo EXIF GPS                │ city/neighbourhood
─────────────────────  ┴─────────────────────────────────────────────┴────────────────────────
```

---

## 3. Command-by-command implementation

### 3.1 "Find me a home exchange for the next week"

**Tech:** custom `AppIntent` returning an interactive `SnippetIntent`; `ListingEntity: IndexedEntity` for semantic resolution; date parsed by the system / Foundation Models.

**New types**
- `ListingEntity: AppEntity, IndexedEntity` — wraps your existing `Listing` (`ios/Swapl/Core/Models/Listing.swift`). Index `title`, `city`, `neighbourhood`, `country`, amenities via `@Property(indexingKey:)`. Use `@DeferredProperty` for the heavy detail/photos so search stays cheap.
- `FindSwapIntent: AppIntent` with `@Parameter` for `destination: String?`, `dateFrom/dateTo: Date?`, `guests: Int?`.

```swift
@available(iOS 26, *)
struct FindSwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Find a home swap"
    static let description = IntentDescription("Search Swapl listings by place and dates.")

    @Parameter(title: "Destination") var destination: String?
    @Parameter(title: "From") var dateFrom: Date?
    @Parameter(title: "To")   var dateTo: Date?
    @Parameter(title: "Guests") var guests: Int?

    @Dependency var listings: ListingRepository   // your existing repo

    @MainActor
    func perform() async throws -> some IntentResult & ShowsSnippetView & ReturnsValue<[ListingEntity]> {
        let filters = SearchFilters(city: destination, dateFrom: dateFrom,
                                    dateTo: dateTo, sleeps: guests)
        let results = try await listings.search(filters)            // GET /api/listings
        let entities = results.map(ListingEntity.init)
        return .result(value: entities,
                       view: SwapResultsSnippet(listings: entities)) // tappable cards
    }
}
```

- The snippet shows 3–5 cards; tapping one runs an `OpenListingIntent(ListingEntity)` → your `DeepLinkRouter` opens `ListingDetailView`.
- "for the next week" is resolved to a `DateComponents` range by Siri before your `perform()` runs — you just receive `dateFrom/dateTo`. Add a fallback: if both nil, default to "next 7 days" inside `perform()`.
- Register an `AppShortcutsProvider` phrase set ("Find a home swap in Swapl", "Find me a place to swap in \(.applicationName)") so it works on iOS 26 too; on iOS 27 Gemini-Siri can also reach it without the exact phrase.

### 3.2 "Accept that home exchange from that Brazilian family"

Two resolution paths — implement **both**, they compose:

**(a) Onscreen awareness — "that one."** When the user is looking at the swaps inbox, tag each row so Siri can bind "that" to a concrete entity. In `ios/Swapl/Features/Swaps/SwapsInboxView.swift`:

```swift
ProposalRow(p)
    .appEntityIdentifier(EntityIdentifier(for: ProposalEntity.self, identifier: p.id)) // iOS 27
```

**(b) Name resolution — "the Brazilian family."** A `ProposalEntity` with an `EntityStringQuery` that matches against `otherName` _and_ the counterpart listing's `country`/`city` (so "Brazilian" hits `country == "Brazil"`). `PersonNameComponents` parameter type lets Siri pass a structured name.

```swift
@available(iOS 27, *)
struct AcceptSwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Accept a home swap"
    @Parameter(title: "Swap proposal") var proposal: ProposalEntity
    @Dependency var proposals: ProposalRepository

    static var parameterSummary: some ParameterSummary {
        Summary("Accept the swap with \(\.$proposal)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ShowsSnippetView {
        // Confirm before a hard-to-reverse action:
        try await requestConfirmation(
            actionName: .go,
            snippetIntent: ConfirmAcceptSnippet(proposal: proposal))
        let res = try await proposals.act(proposalId: proposal.id, .accept) // POST /api/proposals/{id}
        return .result(view: SwapAcceptedSnippet(agreementId: res.agreementId))
    }
}
```

- `ProposalEntity` wraps `ProposalSummary` / `ProposalDetail` (`ios/Swapl/Core/Models/Proposal.swift`). Resolution query should only return rows where `meSide == "target"` and `canRespond == true` (you can't accept your own / terminal proposals).
- Accept is **irreversible** → always `requestConfirmation` with a snippet showing the home, dates, and other user, before the `POST`.

### 3.3 "I took pictures of this new apartment — list it for swapping"

This is the showcase. Three stages:

**Stage 1 — Visual Intelligence entry (optional but slick).** Implement `IntentValueQuery` so when the user is in the camera/Visual Intelligence on a room, Swapl appears as "List this place on Swapl." Use `@UnionValue` if you want to also surface comparable existing listings.

```swift
@available(iOS 26, *)
struct SwaplVisualQuery: IntentValueQuery {
    func values(for descriptor: SemanticContentDescriptor) async throws -> [DraftListingEntity] {
        // descriptor.labels (e.g. "kitchen","sofa") + descriptor.pixelBuffer
        [DraftListingEntity(seedImage: descriptor.pixelBuffer, labels: descriptor.labels)]
    }
}
```

**Stage 2 — On-device extraction with Foundation Models (multimodal).** Replace the current regex-only `ExtractedListingInfo` (`SwaplCreateListingIntent.swift`) with guided generation over the actual photos. This is the big upgrade.

```swift
@available(iOS 26, *)
@Generable struct ListingDraftAI {
    @Guide(description: "Catchy listing title, max 8 words") var title: String
    @Guide(description: "Warm 2-sentence description")       var summary: String
    @Guide(.range(0...12)) var bedrooms: Int
    @Guide(.range(0...12)) var bathrooms: Int
    @Guide(.range(1...20)) var sleeps: Int
    @Guide(description: "Amenities visible in the photos")
    var amenities: [String]               // pool, balcony, wfh-desk, …
    var propertyType: String              // apartment / house / loft
}

let session = LanguageModelSession()
let draft = try await session.respond(
    to: Prompt("Analyze these apartment photos and produce a home-swap listing.",
               images: photoBuffers),     // multimodal
    generating: ListingDraftAI.self).content
```

**Stage 3 — Location.** Pull GPS from photo EXIF (`PHAsset.location`) or `CoreLocation` (you already import both). Reverse-geocode → `city` / `neighbourhood` / `country`, matching your `ListingCreateDraft` fields. Then prefill `ListingCreationView` (it already accepts `extractedInfo: ExtractedListingInfo?`) — just widen `ExtractedListingInfo` to carry the AI fields + amenities + coordinates.

> This whole flow is a `LongRunningIntent` (iOS 27): photo upload (`APIClient.uploadListingPhoto`) + AI gen can exceed 30s; show progress as a Live Activity and make it `CancellableIntent`.

### 3.4 "Give me homeswap options for my summer holiday (from my calendar)"

**Tech:** EventKit + `FindSwapIntent`.

- Add `NSCalendarsUsageDescription` (or the iOS 17+ write-only / full-access variants) to `Info.plist`. Request `EKEventStore` access.
- Heuristic for "summer holiday": query `EKEvent`s whose title matches holiday/vacation/PTO terms (localized — you ship 12 languages) within the summer window, OR all-day multi-day events in Jun–Aug. Take the dominant range.
- Feed that range into `FindSwapIntent(dateFrom:dateTo:)`. If multiple candidate trips, return a disambiguation snippet ("Found 2 trips — Sicily (Jul 5–15) or Lisbon (Aug 1–9)?").
- Optional bonus: once a swap is accepted, **write** the trip back to the calendar (you have `TripCockpit` dates + keycodes) — `EKEvent` with check-in/out, location unlocked from the agreement.

---

## 4. Proposed architecture for Swapl

### New files (suggested)
```
ios/Swapl/Features/SiriIntents/
├── Entities/
│   ├── ListingEntity.swift        // AppEntity + IndexedEntity, wraps Listing
│   ├── ProposalEntity.swift       // AppEntity, wraps ProposalSummary/Detail
│   └── DraftListingEntity.swift   // visual-intelligence seed
├── Intents/
│   ├── FindSwapIntent.swift
│   ├── AcceptSwapIntent.swift     // + DeclineSwapIntent, CounterSwapIntent
│   ├── OpenListingIntent.swift    // OpenIntent for snippet taps
│   └── ListFromPhotosIntent.swift // LongRunning + Cancellable
├── Queries/
│   ├── ListingEntityQuery.swift   // IndexedEntity / EntityStringQuery
│   ├── ProposalEntityQuery.swift  // EntityStringQuery (name + country)
│   └── SwaplVisualQuery.swift     // IntentValueQuery
├── AI/
│   └── ListingExtractor.swift     // FoundationModels @Generable wrapper
├── Snippets/
│   ├── SwapResultsSnippet.swift
│   ├── ConfirmAcceptSnippet.swift
│   └── SwapAcceptedSnippet.swift
└── SwaplAppShortcuts.swift        // MOVE here from Features/Listings, extend
```

### Plumbing that already favors you
- **Auth:** `APIClient.shared` reads the Bearer token from Keychain. App Intents run **in-process** with the app (no separate extension needed unless you choose one), so `AuthService` + repos are directly usable. Use `@Dependency` to inject `ListingRepository` / `ProposalRepository`.
  - ⚠️ If you later add an **App Intents extension** for performance, it's a _separate process_ — share the Keychain via an **access group** (your entitlements already use Keychain) so the token is reachable.
- **Routing:** `DeepLinkRouter` + `swapl://` scheme is mature → snippet taps and `openAppWhenRun` route cleanly to `ListingDetailView` / `ProposalDetailView`.
- **Repos:** `ListingRepository.search(SearchFilters)`, `ProposalRepository.act(id:, .accept)` are exactly the verbs the intents need — minimal new backend work.

### Backend touch-points (small)
- A **semantic search** endpoint helps "homes near the beach" style queries (your `/api/listings` is filter-based today). Either: (a) extend filters, or (b) let `IndexedEntity` + on-device semantic index handle ranking after a coarse server fetch.
- Stable entity IDs already exist (`Listing.id`, `ProposalSummary.id` are server UUIDs) → perfect for `SyncableEntity`.

---

## 5. Phased roadmap

| Phase | Scope | iOS req | Effort | Payoff |
|---|---|---|---|---|
| **0 — Foundation** | `ListingEntity`/`ProposalEntity` as `IndexedEntity`; Spotlight indexing of listings & active swaps; move/extend `SwaplAppShortcuts`. | 26 | S | Listings searchable in Spotlight; entities ready for everything below. |
| **1 — Search & Accept** | `FindSwapIntent` (+ snippet), `AcceptSwapIntent`/`DeclineSwapIntent` with confirmation, `OpenListingIntent`. AppShortcut phrases. | 26 | M | Commands #1 and #2 working via Shortcuts + Siri phrases. |
| **2 — AI listing from photos** | Foundation Models multimodal `ListingExtractor`; widen `ExtractedListingInfo`; EXIF/CoreLocation geocode; wire into `ListingCreationView`. | 26 | M–L | Command #3 (the demo magnet). Replaces brittle regex. |
| **3 — Calendar** | EventKit holiday-range resolution → `FindSwapIntent`; optional write-back of accepted trips. | 17+ (EventKit) | S | Command #4. |
| **4 — iOS 27 polish** | Onscreen awareness (`appEntityIdentifier`), `SyncableEntity`, `LongRunningIntent`+Live Activity for uploads, Visual Intelligence `IntentValueQuery`, Gemini-Siri NL testing. | 27 | M | "Accept _that_ one", cross-device, camera entry, conversational Siri. |
| **5 — Widgets (adjacent)** | Trip-countdown / next-swap WidgetKit + Live Activity from `TripCockpit`. | 17+ | M | Glanceable retention surface (none exists today). |

---

## 6. Constraints, gotchas & decisions

- **No commerce/travel schema** → you're on custom intents. Upside: full control. Downside: pre-iOS-27 Siri needs your `AppShortcutsProvider` phrases; lean on those + Spotlight until Gemini-Siri NL matching is broad.
- **Model choice per task:**
  - _On-device Foundation Models_ → photo→listing extraction, date parsing, message drafting. **Private, free, offline.** Note: small context window, not a general chatbot — keep prompts structured via `@Generable`.
  - _Gemini-Siri (cloud)_ → only the conversational routing layer Apple controls; don't send raw private photos through it. Apple's stance: data used only to execute the request — still, default sensitive extraction to on-device.
  - _Your server AI_ (`/api/ai/*`, `AssistantRepository`) → heavy generation / valuation as today.
- **Irreversible actions** (`accept`, `decline`, `withdraw`) → always `requestConfirmation` with a snippet. Never let Siri silently accept.
- **Deployment target:** keep min at 17; gate new code with `@available`. Don't regress the existing 17+ intents.
- **Privacy / coords:** your `toDTO` fuzzes lat/lng for non-owners (per project rules). Make sure `ListingEntity` exposed to Siri uses the **fuzzed** coordinates unless it's the owner's own listing.
- **Localization:** all `LocalizedStringResource` titles/phrases and the EventKit holiday-keyword matching must cover your 12 shipped languages — add keys to `dict-en` first per your i18n rules, and mirror into `Localizable.xcstrings` for the iOS side.
- **SiriKit deprecation (WWDC26):** non-issue — you never used it.
- **Testing ladder (Apple-recommended):** `AppIntentsTesting` (unit) → Shortcuts app (shape) → Spotlight (indexing) → Siri (E2E). Wire `AppIntentsTesting` into your iOS test target.

---

## 7. Concrete next steps

1. **Phase 0 PR:** add `ListingEntity`/`ProposalEntity` (`IndexedEntity`), index on launch, and relocate `SwaplAppShortcuts` into `Features/SiriIntents/`. Zero user-visible risk, unlocks everything.
2. **Spike Foundation Models** in a throwaway target: feed 3 real apartment photos, confirm `ListingDraftAI` quality vs. the current regex. This de-risks the headline feature (#3) before committing.
3. **Decide:** in-process intents (simplest, reuses `APIClient`) vs. App Intents extension (faster cold-launch, but needs Keychain access-group sharing). Recommend **in-process** to start.
4. **Backend:** confirm `/api/listings` can take the `FindSwapIntent` filter shape; consider a lightweight semantic-rank pass.

---

### Sources
- [Apple unveils next generation of Apple Intelligence & Siri (Newsroom, Jun 2026)](https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/)
- [WWDC 2026 recap — Siri AI, iOS 27 (TechCrunch)](https://techcrunch.com/2026/06/09/wwdc-2026-everything-announced-on-siri-ai-os-27-apple-intelligence-and-more/)
- [Build intelligent Siri experiences with App Schemas — WWDC26 240](https://developer.apple.com/videos/play/wwdc2026/240/)
- [Discover new capabilities in the App Intents framework — WWDC26 345](https://developer.apple.com/videos/play/wwdc2026/345/)
- [Explore advanced App Intents features for Siri and Apple Intelligence — WWDC26 343](https://developer.apple.com/videos/play/wwdc2026/343/)
- [Best practices for integrating visual intelligence — WWDC26 297](https://developer.apple.com/videos/play/wwdc2026/297/)
- [App Intent domains — Apple Developer Documentation](https://developer.apple.com/documentation/appintents/app-intent-domains)
- [Foundation Models — Apple Developer Documentation](https://developer.apple.com/documentation/FoundationModels)
- [App Intents 2.0 in iOS 26: Visual Intelligence, Interactive Snippets, Deferred Properties (Blake Crosley)](https://blakecrosley.com/blog/app-intents-2-ios-26-additions)
- [App Schemas: Make Your App Available to Siri — iOS 27 (Blake Crosley)](https://blakecrosley.com/blog/app-schemas-siri-ios-27)
- [Creating App Intents using Assistant Schemas (Create with Swift)](https://www.createwithswift.com/creating-app-intents-using-assistant-schemas/)
