import Foundation

// Mirrors GET /api/me/story (DOK-158) — the caller's "Swapl story": a postcard
// timeline of every place they've travelled to and every guest they've hosted,
// derived server-side from COMPLETED SwapAgreements and completed KeysStays.
// Real data only; the share block carries the referral code that closes the
// viral loop (same ?ref=CODE scheme used everywhere else).
struct SwaplStory: Decodable, Sendable {
    let timeline: [Event]
    let counts: Counts
    let share: Share

    // One stamp on the passport: either a trip (you stayed somewhere) or a
    // hosting (you welcomed a guest into your home). Ordered by dateTo desc.
    struct Event: Decodable, Sendable, Identifiable, Hashable {
        let kind: Kind
        let city: String
        let country: String
        let dateFrom: String   // ISO8601
        let dateTo: String     // ISO8601
        let year: Int
        let counterpartName: String?
        let listingTitle: String?

        enum Kind: String, Decodable, Sendable {
            case trip
            case hosting
        }

        // No server id; the list renders in a stable order, so derive a stable
        // identity from the fields that make an event unique.
        var id: String { "\(kind.rawValue)-\(city)-\(dateFrom)-\(dateTo)-\(counterpartName ?? "")" }

        private enum CodingKeys: String, CodingKey {
            case kind, city, country, dateFrom, dateTo, year, counterpartName, listingTitle
        }
    }

    struct Counts: Decodable, Sendable {
        let trips: Int
        let hostings: Int
        let cities: Int
        let countries: Int
    }

    struct Share: Decodable, Sendable {
        let referralCode: String
        let referralUrl: String
    }
}
