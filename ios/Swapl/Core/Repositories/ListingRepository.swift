import Foundation

final class ListingRepository: @unchecked Sendable {
    static let shared = ListingRepository()

    func search(filters: SearchFilters) async throws -> ListingSearchResponse {
        try await APIClient.shared.send(
            "GET", "/api/listings",
            query: filters.toQuery()
        )
    }

    func detail(id: String) async throws -> ListingDetailResponse {
        try await APIClient.shared.send("GET", "/api/listings/\(id)")
    }

    struct CreateBody: Encodable {
        let title: String
        let description: String
        let propertyType: String
        let city: String
        let neighbourhood: String
        let country: String
        let address: String?
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
        let gym: Bool
        let ac: Bool
        let dishwasher: Bool
        let washer: Bool
        let dryer: Bool
        let availableFrom: String
        let availableTo: String
        let minStayDays: Int
        let maxStayDays: Int
        let photos: [String]
        let tags: [String]
    }

    struct CreateResponse: Decodable, Sendable {
        let ok: Bool
        let id: String
    }

    func create(_ body: CreateBody) async throws -> CreateResponse {
        try await APIClient.shared.send("POST", "/api/listings", body: body)
    }
}

struct SearchFilters: Sendable {
    var cities: [String] = []
    var propertyTypes: [String] = []
    var minSqm: Int = 30
    var minSleeps: Int = 1
    var petsRequired: Bool = false
    var wfhRequired: Bool = false
    var stepFreeRequired: Bool = false
    var dateFrom: String?
    var dateTo: String?
    var sort: String = "match"
    var page: Int = 1

    func toQuery() -> [URLQueryItem] {
        var q: [URLQueryItem] = []
        if !cities.isEmpty { q.append(URLQueryItem(name: "city", value: cities.joined(separator: ","))) }
        if !propertyTypes.isEmpty { q.append(URLQueryItem(name: "type", value: propertyTypes.joined(separator: ","))) }
        if minSqm > 30 { q.append(URLQueryItem(name: "minSqm", value: String(minSqm))) }
        if minSleeps > 1 { q.append(URLQueryItem(name: "minSleeps", value: String(minSleeps))) }
        if petsRequired { q.append(URLQueryItem(name: "pets", value: "1")) }
        if wfhRequired { q.append(URLQueryItem(name: "wfh", value: "1")) }
        if stepFreeRequired { q.append(URLQueryItem(name: "stepFree", value: "1")) }
        if let dateFrom { q.append(URLQueryItem(name: "from", value: dateFrom)) }
        if let dateTo { q.append(URLQueryItem(name: "to", value: dateTo)) }
        if sort != "match" { q.append(URLQueryItem(name: "sort", value: sort)) }
        if page > 1 { q.append(URLQueryItem(name: "page", value: String(page))) }
        return q
    }
}
