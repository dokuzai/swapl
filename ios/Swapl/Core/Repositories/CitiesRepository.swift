import Foundation

// GET /api/cities — distinct cities of active listings with counts. No auth.
// Backs the destination type-ahead in the browse filter sheet.
final class CitiesRepository: @unchecked Sendable {
    static let shared = CitiesRepository()

    func autocomplete(prefix: String) async throws -> CityAutocompleteResponse {
        var query: [URLQueryItem] = []
        let trimmed = prefix.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { query.append(URLQueryItem(name: "q", value: trimmed)) }
        return try await APIClient.shared.send("GET", "/api/cities", query: query)
    }
}

struct CityAutocompleteItem: Decodable, Hashable, Sendable, Identifiable {
    let city: String
    let country: String
    let listings: Int

    var id: String { "\(city)|\(country)" }
}

struct CityAutocompleteResponse: Decodable, Sendable {
    let items: [CityAutocompleteItem]
}
