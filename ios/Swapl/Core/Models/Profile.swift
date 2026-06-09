import Foundation

struct PublicProfile: Decodable, Sendable {
    let user: User
    let listings: [Listing]

    struct User: Decodable, Sendable {
        let id: String
        let name: String?
        let avatar: String?
        let bio: String?
        let bioVibe: String?
        let verified: Bool
        let memberSince: String
        let interests: [String]
    }
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
