import AppIntents
import SwiftUI
import Foundation
import EventKit

// MARK: - Siri / Apple Intelligence verbs (Phase 1)
//
// User-facing App Intents built on the Phase 0 entities (SwaplSiriEntities.swift):
//   • FindSwapIntent     — "Find me a home exchange for next week"
//   • OpenListingIntent  — open a result card / Spotlight hit in the app
//   • AcceptSwapIntent   — "Accept the swap with the Brazilian family"
//   • DeclineSwapIntent  — decline an incoming proposal
//
// The app targets iOS 26+, so no @available gating is required.
// Accept/Decline run WITHOUT opening the app (openAppWhenRun = false) so they
// work hands-free, and always ask for confirmation before the irreversible call.

// MARK: - Onscreen awareness (iOS 27 / NSUserActivity)

/// NSUserActivity types used to tell the system which entity is on screen, so
/// Siri / Apple Intelligence can resolve "accept that swap" / "open this home"
/// against the visible entity. Must be listed in Info.plist NSUserActivityTypes.
/// (Uses NSUserActivity.appEntityIdentifier — public since iOS 18.2 — because
/// SwiftUI's `.appEntityIdentifier` view modifier is SPI in the iOS 27 beta.)
enum SwaplActivity {
    static let viewingProposal = "fun.swapl.viewing-proposal"
    static let viewingListing = "fun.swapl.viewing-listing"

    /// Configure an activity purely for on-screen entity resolution: no Handoff
    /// banner and no Spotlight / Siri-suggestion entries (entities are already
    /// indexed via IndexedEntity), since the app has no activity-restoration
    /// handlers — just the on-screen entity identifier + a title.
    static func annotate(_ activity: NSUserActivity, entity: EntityIdentifier, title: String?) {
        activity.isEligibleForHandoff = false
        activity.isEligibleForSearch = false
        activity.isEligibleForPrediction = false
        activity.appEntityIdentifier = entity
        if let title { activity.title = title }
    }
}

// MARK: - Navigation bridge

/// Lets an in-process App Intent ask the running app to navigate. Intents run in
/// the app's process, so `SiriRouter.shared` is the same instance `RootView`
/// observes. RootView flushes `pending` into its deep-link sheet.
@MainActor
@Observable
final class SiriRouter {
    static let shared = SiriRouter()
    var pending: DeepLinkDestination?
    private init() {}

    func open(_ destination: DeepLinkDestination) { pending = destination }
}

// MARK: - Date helpers

private enum SwaplIntentDates {
    /// The server's `/api/listings` `from`/`to` params are calendar dates.
    static func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Resolve a from/to window, defaulting to "the next 7 days" when missing.
    static func window(from: Date?, to: Date?) -> (from: Date, to: Date) {
        let start = from ?? Date()
        let end = to ?? Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start
        return (start, end)
    }
}

// MARK: - Shared search

/// The search both FindSwapIntent and FindHolidaySwapIntent run, so the two
/// intents stay in lockstep.
enum SwapSearch {
    static func run(destination: String?, from: Date, to: Date, guests: Int? = nil) async throws -> [ListingEntity] {
        var filters = SearchFilters()
        if let destination, !destination.trimmingCharacters(in: .whitespaces).isEmpty {
            filters.cities = [destination]
        }
        filters.dateFrom = SwaplIntentDates.isoDay(from)
        filters.dateTo = SwaplIntentDates.isoDay(to)
        if let guests, guests > 1 { filters.minSleeps = guests }
        let response = try await ListingRepository.shared.search(filters: filters)
        return response.items.prefix(5).map { ListingEntity($0.listing) }
    }

    /// " in <place>" or "" — for the spoken dialog.
    static func destinationSuffix(_ destination: String?) -> String {
        guard let d = destination?.trimmingCharacters(in: .whitespaces), !d.isEmpty else { return "" }
        return " in \(d)"
    }
}

// MARK: - FindSwapIntent

struct FindSwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Find a Home Swap"
    static let description = IntentDescription("Search Swapl homes by destination and dates.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Destination")
    var destination: String?

    @Parameter(title: "Check-in", kind: .date)
    var dateFrom: Date?

    @Parameter(title: "Check-out", kind: .date)
    var dateTo: Date?

    @Parameter(title: "Guests")
    var guests: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Find a home swap in \(\.$destination)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let win = SwaplIntentDates.window(from: dateFrom, to: dateTo)
        let listings = try await SwapSearch.run(destination: destination, from: win.from, to: win.to, guests: guests)
        let suffix = SwapSearch.destinationSuffix(destination)
        let dialog: IntentDialog = listings.isEmpty
            ? "I couldn't find any home swaps\(suffix) for those dates."
            : "I found \(listings.count) home swap\(listings.count == 1 ? "" : "s")\(suffix)."
        return .result(dialog: dialog, view: SwapResultsSnippet(listings: listings))
    }
}

// MARK: - FindHolidaySwapIntent (calendar dates)

/// Reads the user's calendar to find their next holiday window, then searches
/// swaps for those dates. "Find me a home swap for my summer holiday."
struct FindHolidaySwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Find a Holiday Home Swap"
    static let description = IntentDescription("Find home swaps for your next holiday, using the dates in your calendar.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Destination")
    var destination: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Find a holiday home swap in \(\.$destination)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let now = Date()
        let horizon = Calendar.current.date(byAdding: .month, value: 6, to: now) ?? now
        let suffix = SwapSearch.destinationSuffix(destination)
        let lookup = await CalendarHolidayFinder.lookup(from: now, to: horizon)

        if let trip = lookup.windows.first {
            let listings = try await SwapSearch.run(destination: destination, from: trip.from, to: trip.to)
            let label = trip.title.isEmpty ? String(localized: "your trip") : trip.title
            let dialog: IntentDialog = listings.isEmpty
                ? "I found \(label) in your calendar but no swaps\(suffix) for those dates."
                : "For \(label), here \(listings.count == 1 ? "is" : "are") \(listings.count) swap\(listings.count == 1 ? "" : "s")\(suffix)."
            return .result(dialog: dialog, view: SwapResultsSnippet(listings: listings))
        }

        // No trip to anchor on — still give a useful answer (week ahead), but be
        // honest about WHY: missing calendar access reads very differently from
        // "you have no trips booked".
        let win = SwaplIntentDates.window(from: nil, to: nil)
        let listings = try await SwapSearch.run(destination: destination, from: win.from, to: win.to)
        let dialog: IntentDialog = lookup.accessGranted
            ? "I couldn't find a holiday in your calendar, so here are swaps for the week ahead\(suffix)."
            : "I can't see your calendar yet — turn on Calendar access for Swapl in Settings to search your holiday dates. For now, here are swaps for the week ahead\(suffix)."
        return .result(dialog: dialog, view: SwapResultsSnippet(listings: listings))
    }
}

// MARK: - Calendar holiday finder (EventKit)

struct CalendarDateWindow: Sendable {
    let title: String
    let from: Date
    let to: Date
    var durationDays: Int { Calendar.current.dateComponents([.day], from: from, to: to).day ?? 0 }
}

enum CalendarHolidayFinder {
    // Holiday/vacation/trip terms across Swapl's shipped locales (en/it/fr/es/
    // ar/fa/el/ro/tr/id/th/zh/ja).
    private static let holidayTerms = [
        // en
        "holiday", "holidays", "vacation", "trip", "getaway", "break away",
        // it / fr / es / pt-ish / de
        "vacanza", "vacanze", "ferie", "vacances", "vacaciones", "férias", "ferias", "urlaub",
        // ro / tr / id
        "concediu", "tatil", "libur", "liburan",
        // el / ar / fa / th
        "διακοπές", "عطلة", "إجازة", "تعطیلات", "مرخصی", "วันหยุด", "เที่ยว",
        // zh / ja
        "假期", "度假", "旅行", "旅游", "休暇", "夏休み",
    ]

    static func isHoliday(_ title: String?) -> Bool {
        guard let t = title?.lowercased(), !t.isEmpty else { return false }
        return holidayTerms.contains { t.contains($0) }
    }

    struct Lookup: Sendable {
        let accessGranted: Bool
        let windows: [CalendarDateWindow]
    }

    /// Candidate holiday windows in [start, end], plus whether calendar access
    /// was actually granted (so the caller can distinguish "no access" from
    /// "no holiday found"). Holiday-titled events rank first, then longer
    /// all-day events, then sooner.
    static func lookup(from start: Date, to end: Date) async -> Lookup {
        let store = EKEventStore()
        let granted = (try? await store.requestFullAccessToEvents()) ?? false
        guard granted else { return Lookup(accessGranted: false, windows: []) }

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        let cal = Calendar.current
        let candidates: [CalendarDateWindow] = store.events(matching: predicate).compactMap { ev in
            guard let s = ev.startDate, let e = ev.endDate, e > s else { return nil }
            if ev.status == .canceled { return nil }
            // Skip invites the user declined.
            if let me = ev.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined {
                return nil
            }
            let days = cal.dateComponents([.day], from: s, to: e).day ?? 0
            let titled = isHoliday(ev.title)
            // Titled events up to ~45 days, OR a genuine multi-day all-day event
            // (2–30 days) — long enough to be a trip, short enough to exclude
            // conferences/terms/memberships and single-day all-day items
            // (birthdays, reminders).
            guard (titled && days <= 45) || (ev.isAllDay && days >= 2 && days <= 30) else { return nil }
            return CalendarDateWindow(title: ev.title ?? "", from: s, to: e)
        }
        let sorted = candidates.sorted { a, b in
            let ha = isHoliday(a.title), hb = isHoliday(b.title)
            if ha != hb { return ha }
            if a.durationDays != b.durationDays { return a.durationDays > b.durationDays }
            return a.from < b.from
        }
        return Lookup(accessGranted: true, windows: sorted)
    }
}

// MARK: - OpenListingIntent

/// Opens a specific home in the app — used when a result card or Spotlight hit
/// is tapped. `OpenIntent` brings the app to the foreground automatically.
struct OpenListingIntent: OpenIntent {
    static let title: LocalizedStringResource = "Open Home"

    @Parameter(title: "Home")
    var target: ListingEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        SiriRouter.shared.open(.listing(id: target.id))
        return .result()
    }
}

// MARK: - AcceptSwapIntent

struct AcceptSwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Accept a Home Swap"
    static let description = IntentDescription("Accept an incoming home-swap proposal.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Home swap")
    var proposal: ProposalEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Accept the swap with \(\.$proposal)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard proposal.canRespond else {
            return .result(dialog: "The swap with \(proposal.otherName) can't be accepted right now.")
        }

        // Accept is irreversible — confirm first, showing what's at stake.
        try await requestConfirmation(
            actionName: .go,
            dialog: "Accept the swap with \(proposal.otherName) in \(proposal.theirCity), \(proposal.dateFrom) to \(proposal.dateTo)?"
        )

        let res = try await ProposalRepository.shared.act(proposalId: proposal.id, .accept)
        return .result(dialog: res.ok
            ? "Done — your swap with \(proposal.otherName) is confirmed."
            : "Something went wrong accepting that swap. Try again in the app.")
    }
}

// MARK: - DeclineSwapIntent

struct DeclineSwapIntent: AppIntent {
    static let title: LocalizedStringResource = "Decline a Home Swap"
    static let description = IntentDescription("Decline an incoming home-swap proposal.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Home swap")
    var proposal: ProposalEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Decline the swap with \(\.$proposal)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard proposal.canRespond else {
            return .result(dialog: "The swap with \(proposal.otherName) can't be declined right now.")
        }

        try await requestConfirmation(
            actionName: .go,
            dialog: "Decline the swap with \(proposal.otherName)?"
        )

        let res = try await ProposalRepository.shared.act(proposalId: proposal.id, .decline)
        return .result(dialog: res.ok
            ? "Declined the swap with \(proposal.otherName)."
            : "Something went wrong. Try again in the app.")
    }
}

// MARK: - Snippet UI
//
// Rendered out-of-process by Siri/Shortcuts — system fonts only (the brand
// fonts registered at launch aren't available here), same as the existing
// CreateListingSnippet.

struct SwapResultsSnippet: View {
    let listings: [ListingEntity]

    // App Intents synthesize an initializer that takes the @Parameter wrappers,
    // so set the value via the property instead of an init argument.
    static func openIntent(for listing: ListingEntity) -> OpenListingIntent {
        let intent = OpenListingIntent()
        intent.target = listing
        return intent
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if listings.isEmpty {
                Label("No matching homes", systemImage: "house.slash")
                    .font(.headline)
                Text("Try a different place or dates.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(listings, id: \.id) { listing in
                    Button(intent: Self.openIntent(for: listing)) {
                        SwapResultRow(listing: listing)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding()
    }
}

private struct SwapResultRow: View {
    let listing: ListingEntity

    var body: some View {
        HStack(spacing: 12) {
            cover
            VStack(alignment: .leading, spacing: 2) {
                Text(listing.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(listing.neighbourhood.isEmpty ? listing.city : "\(listing.neighbourhood), \(listing.city)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Label("Sleeps \(listing.sleeps) · \(listing.bedrooms) bd", systemImage: "bed.double")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder
    private var cover: some View {
        if let url = listing.coverPhotoURL {
            AsyncImage(url: url) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Color.gray.opacity(0.15)
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.gray.opacity(0.15))
                .frame(width: 56, height: 56)
                .overlay(Image(systemName: "house").foregroundStyle(.secondary))
        }
    }
}
