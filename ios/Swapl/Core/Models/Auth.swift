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

struct RegisterResponse: Decodable, Sendable {
    let ok: Bool
    let userId: String
    let token: String?       // present for native platforms
    let expiresAt: Date?
}

// GET /api/auth/providers — which sign-in methods are live on this deploy.
// Unconfigured providers are hidden in the UI (env-gated, never broken).
struct ProvidersStatus: Decodable, Sendable {
    let password: Bool
    let google: Bool
    let apple: Bool
    let telegram: Telegram
    let emailOtp: Bool
    let phone: Bool
    // Optional so older deploys (pre-passkey) still decode; nil → hidden.
    let passkey: Bool?

    struct Telegram: Decodable, Sendable {
        let enabled: Bool
        let botUsername: String?
    }
}

struct MeResponse: Decodable, Sendable {
    let user: User
    let counts: Counts
    let subscription: Subscription?
    // DOK-147 — caller's privacy/notification toggles; optional so the app
    // still decodes /api/me from older deploys.
    let settings: UserSettings?

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
        // Rich profile fields (DOK-147) — additive & optional.
        let work: String?
        let languages: [String]?
        let homeCity: String?
        let homeCountry: String?
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
