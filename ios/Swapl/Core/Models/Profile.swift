import Foundation

// Mirrors GET /api/profiles/{id}. The DOK-147 additions (work/languages/home
// city, stats, visited, reviews) are all optional so the app keeps decoding
// responses from older deploys.
struct PublicProfile: Decodable, Sendable {
    let user: User
    let listings: [Listing]
    let stats: Stats?
    let visited: [VisitedCity]?
    let reviews: [Review]?

    struct User: Decodable, Sendable {
        let id: String
        let name: String?
        let avatar: String?
        let bio: String?
        let bioVibe: String?
        let verified: Bool
        let memberSince: String
        let interests: [String]
        // Rich profile fields (DOK-147) — additive & optional.
        let work: String?
        let languages: [String]?
        // Privacy-gated server-side: nil when the host hides their home city.
        let homeCity: String?
        let homeCountry: String?
    }

    struct Stats: Decodable, Sendable {
        let swapsCompleted: Int
        let reviewsCount: Int
        let avgRating: Double?
        let memberSince: String
    }

    // One entry per city+year visited via a COMPLETED swap — real data only.
    struct VisitedCity: Decodable, Hashable, Sendable {
        let city: String
        let country: String
        let year: Int
    }

    struct Review: Decodable, Identifiable, Sendable {
        let id: String
        let author: Author
        let rating: Int
        let text: String
        let createdAt: String

        struct Author: Decodable, Sendable {
            let id: String
            let name: String?
            let avatar: String?
        }
    }
}

// GET/PATCH /api/profile/settings — privacy + notification toggles. The
// server merges partial PATCHes and always answers the full canonical shape.
struct UserSettings: Decodable, Sendable {
    let searchEngineIndexing: Bool
    let showHomeCity: Bool
    let emailNotifications: Bool
    let pushNotifications: Bool
}

struct InterestsCatalog: Decodable, Sendable {
    let catalog: [Tag]
    let categories: [Category]
    let selected: [String]

    struct Tag: Decodable, Hashable, Sendable {
        let slug: String
        let label: String
        let category: String
    }
    struct Category: Decodable, Hashable, Sendable {
        let id: String
        let label: String
    }
}

struct SavedSearch: Identifiable, Decodable, Sendable {
    let id: String
    let name: String
    let query: String
    let alertEnabled: Bool
    let createdAt: String
}
