import Foundation

// Per-listing availability (DOK-159). Mirrors lib/listing/availability.ts —
// THE shared source of truth for "is this listing free for these dates?". The
// calendar editor, the Stay-with-Keys picker and the date-filtered browse all
// read the same /calendar shape so the rules live in exactly one place.

// GET /api/listings/{id}/calendar — public availability snapshot: the published
// window plus every occupied range, each labelled by source so clients can
// colour agreements vs Keys stays vs host blocks.
struct ListingAvailability: Decodable, Sendable {
    let listingId: String
    let availableFrom: String
    let availableTo: String
    let minStayDays: Int
    let maxStayDays: Int
    let bookedRanges: [BookedRange]

    struct BookedRange: Decodable, Sendable, Hashable, Identifiable {
        let dateFrom: String
        let dateTo: String
        // "agreement" | "keys_stay" | "blocked" — why the range is unavailable.
        let source: String

        var id: String { "\(dateFrom)|\(dateTo)|\(source)" }
        var isHostBlock: Bool { source == "blocked" }
    }
}

// GET /api/listings/{id}/blocked-ranges — owner-only manual blocks (renovations,
// personal use). Each has an id so the editor can delete an individual block.
struct HostBlockedRange: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let dateFrom: String
    let dateTo: String
    let note: String?
    let createdAt: String
}

struct HostBlockedRangesResponse: Decodable, Sendable {
    let ranges: [HostBlockedRange]
}

struct HostBlockCreateRequest: Encodable, Sendable {
    let dateFrom: String
    let dateTo: String
    let note: String?
}

struct HostBlockCreateResponse: Decodable, Sendable {
    let ok: Bool
    let range: HostBlockedRange
}

// DELETE /api/listings/{id}/blocked-ranges takes the range id in the body.
struct HostBlockDeleteRequest: Encodable, Sendable {
    let rangeId: String
}
