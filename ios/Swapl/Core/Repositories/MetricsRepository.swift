import Foundation

// Founder-only dashboard data (GET /api/admin/metrics). Bearer auth comes from
// APIClient's tokenProvider; non-admins get 403 {"error":"FORBIDDEN"}.
final class MetricsRepository: @unchecked Sendable {
    static let shared = MetricsRepository()

    func fetch() async throws -> AdminMetrics {
        try await APIClient.shared.send("GET", "/api/admin/metrics")
    }
}

struct AdminMetrics: Decodable, Sendable {
    let now: Now
    let users: Users
    let listingsPerUser: ListingsPerUser
    let cities: Cities
    let engagement: Engagement
    let generatedAt: String

    struct Now: Decodable, Sendable {
        let online: Int
        let dau: Int
        let wau: Int
        let mau: Int
    }

    struct Users: Decodable, Sendable {
        let total: Int
        let emailVerified: Int
        let withActiveListing: Int
        let new7d: Int
        let new30d: Int
    }

    struct ListingsPerUser: Decodable, Sendable {
        let distribution: Distribution
        let avgPerUserWithListing: Double
        let topUsers: [TopUser]

        struct Distribution: Decodable, Sendable {
            let zero: Int
            let one: Int
            let two: Int
            let threePlus: Int
        }

        struct TopUser: Decodable, Sendable, Identifiable {
            let id: String
            let name: String?
            let email: String
            let listings: Int
        }
    }

    struct Cities: Decodable, Sendable {
        let totalActiveListings: Int
        let top: [City]

        struct City: Decodable, Sendable {
            let city: String
            let listings: Int
            let share: Double   // 0..1
        }
    }

    struct Engagement: Decodable, Sendable {
        let proposalsByStatus: [String: Int]
        let proposalsTotal: Int
        let proposalAcceptRate: Double   // 0..1
        let agreementsActive: Int
        let agreementsCompleted: Int
        let messagesTotal: Int
        let messages7d: Int
        let favoritesTotal: Int
        let favorites7d: Int
        let savedSearches: Int
    }
}
