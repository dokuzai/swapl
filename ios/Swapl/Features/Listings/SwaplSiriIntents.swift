import AppIntents
import SwiftUI
import Foundation

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

        var filters = SearchFilters()
        if let destination, !destination.trimmingCharacters(in: .whitespaces).isEmpty {
            filters.cities = [destination]
        }
        filters.dateFrom = SwaplIntentDates.isoDay(win.from)
        filters.dateTo = SwaplIntentDates.isoDay(win.to)
        if let guests, guests > 1 { filters.minSleeps = guests }

        let response = try await ListingRepository.shared.search(filters: filters)
        let listings = response.items.prefix(5).map { ListingEntity($0.listing) }

        let where_ = destination.flatMap { d in
            d.trimmingCharacters(in: .whitespaces).isEmpty ? nil : " in \(d)"
        } ?? ""
        let dialog: IntentDialog = listings.isEmpty
            ? "I couldn't find any home swaps\(where_) for those dates."
            : "I found \(listings.count) home swap\(listings.count == 1 ? "" : "s")\(where_)."

        return .result(dialog: dialog, view: SwapResultsSnippet(listings: Array(listings)))
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
            result: .result(dialog: "Accept the swap with \(proposal.otherName) in \(proposal.theirCity), \(proposal.dateFrom) to \(proposal.dateTo)?"),
            confirmationActionName: .go
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
            result: .result(dialog: "Decline the swap with \(proposal.otherName)?"),
            confirmationActionName: .go
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
