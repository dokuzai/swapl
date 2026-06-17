import Foundation

// GET /api/swapalitics — the signed-in user's travel + impact stats and badges.
final class SwapaliticsRepository: @unchecked Sendable {
    static let shared = SwapaliticsRepository()

    func load() async throws -> Swapalitics {
        try await APIClient.shared.send("GET", "/api/swapalitics")
    }

    // POST /api/location/ping — coarse daily location (or empty → server uses IP).
    @discardableResult
    func pingLocation(_ fix: LocationFix?) async throws -> LocationPingResponse {
        let body = LocationPingBody(
            countryCode: fix?.countryCode,
            region: fix?.region,
            city: fix?.city
        )
        return try await APIClient.shared.send("POST", "/api/location/ping", body: body)
    }
}

struct LocationPingBody: Encodable, Sendable {
    let countryCode: String?
    let region: String?
    let city: String?
}

struct LocationPingResponse: Decodable, Sendable {
    let ok: Bool
    let source: String
}

struct Swapalitics: Decodable, Sendable {
    let nightsAbroad: Int
    let nightsUpcoming: Int
    let nightsHosted: Int
    let swapsCompleted: Int
    let citiesVisited: Int
    let countriesVisited: Int
    let daysTracked: Int
    let daysAbroad: Int
    let homeCountry: String?
    let topCountries: [CountryDays]
    let pctViaSwapl: Int

    struct CountryDays: Decodable, Sendable, Identifiable {
        let country: String
        let days: Int
        var id: String { country }
    }
    let rank: Int
    let totalTravellers: Int
    let percentile: Int
    let avgNightsAllUsers: Int
    let peopleConnected: Int
    let referralsJoined: Int
    let reviewsWritten: Int
    let joinRank: Int
    let badges: [Badge]

    struct Badge: Decodable, Sendable, Identifiable {
        let key: String
        let label: String
        let description: String
        let icon: String
        let earned: Bool
        var id: String { key }
    }
}
