import Foundation

struct AuthUser: Codable, Hashable, Sendable {
    let id: String
    let email: String
    let name: String?
    let avatar: String?
}

struct TokenResponse: Decodable, Sendable {
    let token: String
    let expiresAt: Date
    let user: AuthUser
}

struct RefreshResponse: Decodable, Sendable {
    let token: String
    let expiresAt: Date
}

struct MeResponse: Decodable, Sendable {
    let user: User
    let counts: Counts
    let subscription: Subscription?

    struct User: Decodable, Sendable {
        let id: String
        let email: String
        let name: String?
        let avatar: String?
        let bio: String?
        let bioVibe: String?
        let verified: Bool
        let role: String
        let interests: [String]
        let createdAt: String
    }
    struct Counts: Decodable, Sendable {
        let listings: Int
        let incomingProposals: Int
        let outgoingProposals: Int
        let activeSwaps: Int
    }
    struct Subscription: Decodable, Sendable {
        let planId: String
        let status: String
        let currentPeriodEnd: String
        let cancelAtPeriodEnd: Bool
    }
}
