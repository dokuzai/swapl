import Foundation

// Mirrors lib/listing-utils.ts ListingDTO. Decoded via the @swapl/api OpenAPI
// in a future slice; this hand-written copy unblocks the foundation slice.
struct Listing: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let userId: String
    let ownerName: String?
    let title: String
    let description: String
    let propertyType: String
    let city: String
    let neighbourhood: String
    let country: String
    let sizeSqm: Int
    let sleeps: Int
    let bedrooms: Int
    let bathrooms: Int
    let floor: Int?
    let hasElevator: Bool
    let stepFreeAccess: Bool
    let petsAllowed: Bool
    let petTypes: [String]
    let wfhSetup: Bool
    let wfhDesks: Int
    let hasParking: Bool
    let bikeIncluded: Bool
    let rooftop: Bool
    let balcony: Bool
    let garden: Bool
    let courtyard: Bool
    let piano: Bool
    let pool: Bool
    let ac: Bool
    let washer: Bool
    let dryer: Bool
    let dishwasher: Bool
    // Optional: older servers omit these; address only comes back for the owner.
    let gym: Bool?
    let address: String?
    let availableFrom: String
    let availableTo: String
    let minStayDays: Int
    let maxStayDays: Int
    let photos: [String]
    let tags: [String]
    let palette: String
    let lat: Double?
    let lng: Double?
    let isFeatured: Bool
    let isVerified: Bool
    // Optional owner-proof verification (DOK-162). True once an admin approves a
    // PropertyVerification submission; drives the discreet "Verified owner" trust
    // badge. Optional so older servers that omit it still decode.
    let ownerVerified: Bool?
    // Nightly-Keys valuation (DOK-163). The persisted, server-computed value of a
    // night in this home, in travel points. Optional so older servers omit it.
    let nightlyKeys: Int?
    // Whole-home vs single private room. "entire_place" | "private_room". When a
    // room, the nightly value reflects a rooms coefficient (shown transparently).
    let spaceType: String?
    // Rooms offered when spaceType == "private_room"; nil for a whole place.
    let roomsOffered: Int?
    // DOK-219: host also offers a free couch. A guest with a Couchsurfer
    // membership can send a free couch request for this home. Optional for
    // back-compat with cached/older payloads.
    var couchsurfingAvailable: Bool? = nil
    // 1..5 desirability tier for the home's location, feeding the valuation.
    let locationTier: Int?
    // Owner-only structured explanation of how nightlyKeys is calculated (v2).
    // Present only on your own listing detail; nil for everyone else.
    let valuationExplanation: ValuationExplanation?

    // Host's average review rating (1..5), provided by the favorites endpoint so
    // the wishlist can sort by "feedback". Nil elsewhere / unrated hosts.
    var hostRating: Double? = nil

    // True when this listing is a single private room rather than a whole home.
    var isPrivateRoom: Bool { spaceType == "private_room" }
}

// MARK: - Valuation explanation (DOK-163)

// Owner-only "how your nightly Keys are calculated" payload. Mirrors the v2
// JSON the backend persists on the listing: a clamped, bounded value the owner
// can trust won't lurch. All fields optional so a v1 or partial payload still
// decodes and the sheet degrades gracefully.
struct ValuationExplanation: Codable, Hashable, Sendable {
    let version: Int?
    let base: Int?                 // pre-feedback nightly Keys
    let adjustment: Double?        // ±0.20 review multiplier
    let nightlyKeys: Int?          // final = clamp(round(base*(1+adjustment)))
    let locationTier: Int?         // 1..5
    let spaceType: String?
    let roomsCoefficient: Double?
    let factors: [Factor]?
    let ai: AI?
    let feedback: Feedback?

    struct Factor: Codable, Hashable, Sendable, Identifiable {
        let key: String
        let label: String
        let points: Double
        var id: String { key }
    }

    struct AI: Codable, Hashable, Sendable {
        let source: String         // "ai" | "fallback"
        let bonus: Double
        let summary: String?
    }

    struct Feedback: Codable, Hashable, Sendable {
        let reviewCount: Int
        let avgRating: Double?
        let applied: Bool
    }
}

struct ListingWithScore: Identifiable, Codable, Hashable, Sendable {
    let listing: Listing
    let matchScore: Int?
    let band: String

    var id: String { listing.id }
}

struct ListingSearchResponse: Decodable, Sendable {
    let items: [ListingWithScore]
    let page: Int
    let pageSize: Int
    let total: Int
    let viewerListingId: String?
}

struct ListingDetailResponse: Decodable, Sendable {
    let listing: Listing
    let host: Host
    let matchScore: Int?
    let viewerListingId: String?

    struct Host: Decodable, Sendable {
        let id: String
        let name: String?
        let avatar: String?
        let bio: String?
        let bioVibe: String?
        let verified: Bool
        let memberSince: String
    }
}
