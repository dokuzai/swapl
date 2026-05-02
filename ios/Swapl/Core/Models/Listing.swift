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
