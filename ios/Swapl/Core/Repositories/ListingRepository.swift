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

    // All of the caller's own listings (multi-property hosts).
    struct MyListingsResponse: Decodable, Sendable { let items: [Listing] }
    func myListings() async throws -> [Listing] {
        let r: MyListingsResponse = try await APIClient.shared.send("GET", "/api/me/listings")
        return r.items
    }

    func create(_ draft: ListingCreateDraft) async throws -> ListingCreateResponse {
        try await APIClient.shared.send("POST", "/api/listings", body: draft)
    }

    func update(id: String, _ draft: ListingCreateDraft) async throws -> ListingCreateResponse {
        try await APIClient.shared.send("PUT", "/api/listings/\(id)", body: draft)
    }
}

struct ListingCreateResponse: Decodable, Sendable {
    let ok: Bool
    let id: String
}

struct ListingCreateDraft: Encodable, Sendable {
    var title: String
    var description: String
    var propertyType: String
    var city: String
    var neighbourhood: String
    var country: String
    var address: String?
    var lat: Double?
    var lng: Double?
    var sizeSqm: Int
    var sleeps: Int
    var bedrooms: Int
    var bathrooms: Int
    var floor: Int?
    var hasElevator: Bool
    var stepFreeAccess: Bool
    var petsAllowed: Bool
    var petTypes: [String]
    var wfhSetup: Bool
    var wfhDesks: Int
    var hasParking: Bool
    var bikeIncluded: Bool
    var rooftop: Bool
    var balcony: Bool
    var garden: Bool
    var courtyard: Bool
    var piano: Bool
    var pool: Bool
    var gym: Bool
    var ac: Bool
    var dishwasher: Bool
    var washer: Bool
    var dryer: Bool
    var availableFrom: String
    var availableTo: String
    var minStayDays: Int
    var maxStayDays: Int
    var photos: [String]
    var tags: [String]
    // Whole-home vs single private room (DOK-160). "entire_place" | "private_room".
    // When a private room, the server reduces the nightly-Keys value.
    var spaceType: String
    // Rooms offered when spaceType == "private_room" (1–15); 1 for a whole place.
    var roomsOffered: Int
    // Publish acknowledgment (DOK-162). REQUIRED on create: the host self-attests
    // they have the right to host in the chosen mode. Ignored on update — left nil
    // so the edit flow's encoded body omits them entirely.
    var ackAccepted: Bool? = nil
    var mode: String? = nil
}

struct SearchFilters: Sendable {
    var cities: [String] = []
    var propertyTypes: [String] = []
    var minSqm: Int = 30
    var minSleeps: Int = 1
    var petsRequired: Bool = false
    var wfhRequired: Bool = false
    var stepFreeRequired: Bool = false
    // Space-type filter (DOK-160). nil = all; "entire_place" | "private_room"
    // map to the /api/listings `spaceType` query param.
    var spaceType: String?
    var dateFrom: String?
    var dateTo: String?
    var sort: String = "match"
    var page: Int = 1

    // How many filter groups differ from their defaults — drives the badge on
    // the browse search bar. Sort/page are not "filters" for this purpose.
    var activeFilterCount: Int {
        var count = 0
        if !cities.isEmpty { count += 1 }
        if !propertyTypes.isEmpty { count += 1 }
        if minSqm > 30 { count += 1 }
        if minSleeps > 1 { count += 1 }
        if petsRequired { count += 1 }
        if wfhRequired { count += 1 }
        if stepFreeRequired { count += 1 }
        if spaceType != nil { count += 1 }
        if dateFrom != nil || dateTo != nil { count += 1 }
        return count
    }

    func toQuery() -> [URLQueryItem] {
        var q: [URLQueryItem] = []
        if !cities.isEmpty { q.append(URLQueryItem(name: "city", value: cities.joined(separator: ","))) }
        if !propertyTypes.isEmpty { q.append(URLQueryItem(name: "type", value: propertyTypes.joined(separator: ","))) }
        if minSqm > 30 { q.append(URLQueryItem(name: "minSqm", value: String(minSqm))) }
        if minSleeps > 1 { q.append(URLQueryItem(name: "minSleeps", value: String(minSleeps))) }
        if petsRequired { q.append(URLQueryItem(name: "pets", value: "1")) }
        if wfhRequired { q.append(URLQueryItem(name: "wfh", value: "1")) }
        if stepFreeRequired { q.append(URLQueryItem(name: "stepFree", value: "1")) }
        if let spaceType { q.append(URLQueryItem(name: "spaceType", value: spaceType)) }
        if let dateFrom { q.append(URLQueryItem(name: "from", value: dateFrom)) }
        if let dateTo { q.append(URLQueryItem(name: "to", value: dateTo)) }
        if sort != "match" { q.append(URLQueryItem(name: "sort", value: sort)) }
        if page > 1 { q.append(URLQueryItem(name: "page", value: String(page))) }
        return q
    }
}
