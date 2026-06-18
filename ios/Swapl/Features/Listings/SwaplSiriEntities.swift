import AppIntents
import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

// MARK: - Siri / Apple Intelligence foundation (Phase 0)
//
// This file is the groundwork for bringing Swapl's content to Siri, Spotlight,
// Shortcuts and Apple Intelligence. It does NOT add any user-facing intents on
// its own — it defines the *entities* (the nouns Siri reasons about) plus a
// Spotlight indexer so a member's own homes and live swaps become searchable.
//
// Phase 1 builds the verbs on top of these: FindSwapIntent (search), and
// AcceptSwapIntent / DeclineSwapIntent (act on a ProposalEntity).
//
// The whole app targets iOS 26+, so everything here is available unconditionally;
// no @available gating is required. `@Property` wrappers are intentionally left
// off for now (plain stored properties) to keep this slice low-risk — they get
// layered in during Phase 1 when intents need predicate-queryable parameters.

// MARK: - ListingEntity

/// A home that can be swapped, exposed to the system. Wraps the app's `Listing`
/// model. Conforms to `IndexedEntity` so instances can be pushed into Spotlight.
struct ListingEntity: AppEntity, IndexedEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Home")
    }

    let id: String
    let title: String
    let city: String
    let neighbourhood: String
    let country: String
    let sleeps: Int
    let bedrooms: Int
    let coverPhotoURL: URL?

    init(_ listing: Listing) {
        self.id = listing.id
        self.title = listing.title
        self.city = listing.city
        self.neighbourhood = listing.neighbourhood
        self.country = listing.country
        self.sleeps = listing.sleeps
        self.bedrooms = listing.bedrooms
        // Privacy: photos are public; exact coordinates are intentionally NOT
        // exposed here (they're server-fuzzed for non-owners anyway).
        self.coverPhotoURL = listing.photos.first.flatMap { URL(string: $0) }
    }

    var displayRepresentation: DisplayRepresentation {
        let place = neighbourhood.isEmpty ? city : "\(neighbourhood), \(city)"
        return DisplayRepresentation(
            title: "\(title)",
            subtitle: "\(place)"
        )
    }

    static var defaultQuery = ListingEntityQuery()

    /// Richer Spotlight metadata than the display-representation default — lets
    /// the system match on city/country/keywords, not just the title.
    var attributeSet: CSSearchableItemAttributeSet {
        let set = CSSearchableItemAttributeSet(contentType: .content)
        set.title = title
        set.displayName = title
        set.city = city
        set.country = country
        set.namedLocation = [neighbourhood, city, country]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
        set.contentDescription = "Sleeps \(sleeps) · \(bedrooms) bedrooms — \(city), \(country)"
        set.keywords = [city, country, neighbourhood, "home swap", "swapl"]
            .filter { !$0.isEmpty }
        if let coverPhotoURL { set.thumbnailURL = coverPhotoURL }
        return set
    }
}

/// Resolves `ListingEntity` instances for the system. Backed by the existing
/// network repository since listings live server-side.
struct ListingEntityQuery: EntityQuery, EntityStringQuery {
    /// Resolve specific listings by id (e.g. a tapped Spotlight result).
    func entities(for identifiers: [ListingEntity.ID]) async throws -> [ListingEntity] {
        var results: [ListingEntity] = []
        for id in identifiers {
            if let detail = try? await ListingRepository.shared.detail(id: id) {
                results.append(ListingEntity(detail.listing))
            }
        }
        return results
    }

    /// Free-text match — Phase 0 treats the string as a destination/city, which
    /// is what the `/api/listings` endpoint supports today. FindSwapIntent will
    /// build on this in Phase 1.
    func entities(matching string: String) async throws -> [ListingEntity] {
        let filters = SearchFilters(cities: [string])
        let response = try await ListingRepository.shared.search(filters: filters)
        return response.items.map { ListingEntity($0.listing) }
    }

    /// Surfaced by the system as starting points — the member's own homes.
    func suggestedEntities() async throws -> [ListingEntity] {
        let mine = try await ListingRepository.shared.myListings()
        return mine.map(ListingEntity.init)
    }
}

// MARK: - ProposalEntity

/// A home-swap proposal/exchange, exposed to the system. Wraps `ProposalSummary`.
struct ProposalEntity: AppEntity, IndexedEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Home swap")
    }

    let id: String
    let otherName: String
    let theirCity: String
    let theirCountry: String
    let dateFrom: String
    let dateTo: String
    let status: String
    /// Whether the signed-in member can still accept/decline this one.
    let canRespond: Bool

    init(_ proposal: ProposalSummary) {
        self.id = proposal.id
        self.otherName = proposal.otherName ?? "A Swapl member"
        self.theirCity = proposal.theirCity
        self.theirCountry = proposal.theirCountry ?? ""
        self.dateFrom = proposal.dateFrom
        self.dateTo = proposal.dateTo
        self.status = proposal.status
        self.canRespond = proposal.canRespond
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "Swap with \(otherName)",
            subtitle: "\(theirCity) · \(dateFrom) → \(dateTo)"
        )
    }

    static var defaultQuery = ProposalEntityQuery()

    var attributeSet: CSSearchableItemAttributeSet {
        let set = CSSearchableItemAttributeSet(contentType: .content)
        set.title = "Swap with \(otherName)"
        set.contentDescription = "\(theirCity), \(theirCountry) · \(dateFrom) → \(dateTo)"
        set.keywords = [otherName, theirCity, theirCountry, "swap", "home exchange", "swapl"]
            .filter { !$0.isEmpty }
        return set
    }
}

/// Resolves `ProposalEntity` instances. The proposals inbox is a single fetch,
/// so both id- and string-matching read from it.
struct ProposalEntityQuery: EntityQuery, EntityStringQuery {
    private func allProposals() async throws -> [ProposalSummary] {
        let inbox = try await ProposalRepository.shared.inbox()
        return inbox.buckets.waitingOnYou
            + inbox.buckets.sent
            + inbox.buckets.active
            + inbox.buckets.archived
    }

    func entities(for identifiers: [ProposalEntity.ID]) async throws -> [ProposalEntity] {
        let wanted = Set(identifiers)
        return try await allProposals()
            .filter { wanted.contains($0.id) }
            .map(ProposalEntity.init)
    }

    /// Match on the other party's name or their location — this is what powers
    /// "the swap with the Brazilian family" once AcceptSwapIntent lands.
    func entities(matching string: String) async throws -> [ProposalEntity] {
        let needle = string.lowercased()
        return try await allProposals()
            .filter { p in
                (p.otherName?.lowercased().contains(needle) ?? false)
                    || p.theirCity.lowercased().contains(needle)
                    || (p.theirCountry?.lowercased().contains(needle) ?? false)
            }
            .map(ProposalEntity.init)
    }

    /// Surface the swaps awaiting the member's response as suggestions.
    func suggestedEntities() async throws -> [ProposalEntity] {
        let inbox = try await ProposalRepository.shared.inbox()
        return inbox.buckets.waitingOnYou.map(ProposalEntity.init)
    }
}

// MARK: - Spotlight indexing

/// Pushes the member's own homes and live swaps into Spotlight so they're
/// searchable from the Home Screen / Lock Screen, and so the entities are known
/// to Apple Intelligence ahead of any spoken request.
///
/// Call `reindexAll()` after sign-in and `clear()` on sign-out. All failures are
/// swallowed — Spotlight is a convenience surface, never load-bearing.
enum SwaplSpotlightIndex {
    static func reindexAll() async {
        await reindexMyListings()
        await reindexActiveSwaps()
    }

    static func reindexMyListings() async {
        do {
            let listings = try await ListingRepository.shared.myListings()
            let entities = listings.map(ListingEntity.init)
            try await CSSearchableIndex.default().indexAppEntities(entities)
        } catch {
            // Non-fatal.
        }
    }

    static func reindexActiveSwaps() async {
        do {
            let inbox = try await ProposalRepository.shared.inbox()
            let live = inbox.buckets.waitingOnYou + inbox.buckets.active
            let entities = live.map(ProposalEntity.init)
            try await CSSearchableIndex.default().indexAppEntities(entities)
        } catch {
            // Non-fatal.
        }
    }

    /// Remove all indexed items — call on sign-out so the next account on the
    /// device doesn't inherit the previous member's homes and swaps.
    static func clear() async {
        try? await CSSearchableIndex.default().deleteAllSearchableItems()
    }
}
