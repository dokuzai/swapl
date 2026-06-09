import Foundation

final class ProfileRepository: @unchecked Sendable {
    static let shared = ProfileRepository()

    func publicProfile(id: String) async throws -> PublicProfile {
        try await APIClient.shared.send("GET", "/api/profiles/\(id)")
    }

    func interests() async throws -> InterestsCatalog {
        try await APIClient.shared.send("GET", "/api/profile/interests")
    }

    struct UpdateInterestsBody: Encodable {
        let interests: [String]
        let bioVibe: String?
    }

    func updateInterests(_ body: UpdateInterestsBody) async throws -> EmptyResponse {
        try await APIClient.shared.send("POST", "/api/profile/interests", body: body)
    }

    func savedSearches() async throws -> [SavedSearch] {
        struct Response: Decodable { let items: [SavedSearch] }
        let r: Response = try await APIClient.shared.send("GET", "/api/saved-searches")
        return r.items
    }

    struct ReportBody: Encodable {
        let reason: String
        let detail: String?
        let listingId: String?
        let targetUserId: String?
    }

    func report(_ body: ReportBody) async throws -> EmptyResponse {
        try await APIClient.shared.send("POST", "/api/reports", body: body)
    }
}
