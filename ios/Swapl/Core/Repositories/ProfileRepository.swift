import Foundation

final class ProfileRepository: @unchecked Sendable {
    static let shared = ProfileRepository()

    func publicProfile(id: String) async throws -> PublicProfile {
        try await APIClient.shared.send("GET", "/api/profiles/\(id)")
    }

    // Current-user snapshot — used by the Personal information editor to
    // prefill fields and by the settings screens for the initial toggles.
    func me() async throws -> MeResponse {
        try await APIClient.shared.send("GET", "/api/me")
    }

    // PATCH /api/profile — partial update; only the non-nil keys are sent.
    // Strings are nullable server-side so empty input clears the field.
    struct ProfileUpdateBody: Encodable {
        var name: String?
        var bio: String?
        var work: String?
        var languages: [String]?
        var homeCity: String?
        var homeCountry: String?
        // Off-platform contact channels (DOK-204). Full-replace: the complete
        // desired set is sent each save; the server normalizes + drops invalids.
        var contactChannels: ContactChannels?
    }

    func updateProfile(_ body: ProfileUpdateBody) async throws -> EmptyResponse {
        try await APIClient.shared.send("PATCH", "/api/profile", body: body)
    }

    // GET/PATCH /api/profile/settings — privacy & notification toggles.
    private struct SettingsResponse: Decodable { let settings: UserSettings }

    func settings() async throws -> UserSettings {
        let r: SettingsResponse = try await APIClient.shared.send("GET", "/api/profile/settings")
        return r.settings
    }

    // Partial merge server-side: omitted keys keep their stored value.
    struct SettingsPatch: Encodable {
        var searchEngineIndexing: Bool?
        var showHomeCity: Bool?
        var emailNotifications: Bool?
        var pushNotifications: Bool?
        var countDaysAbroad: Bool?
    }

    func updateSettings(_ patch: SettingsPatch) async throws -> UserSettings {
        let r: SettingsResponse = try await APIClient.shared.send("PATCH", "/api/profile/settings", body: patch)
        return r.settings
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
