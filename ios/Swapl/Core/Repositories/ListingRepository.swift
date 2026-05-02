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
