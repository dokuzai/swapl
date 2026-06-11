import Foundation

// Wishlist endpoints (bearer-authed via APIClient's tokenProvider).
// PUT/DELETE are idempotent server-side, so optimistic toggles can retry safely.
final class FavoritesRepository: @unchecked Sendable {
    static let shared = FavoritesRepository()

    func list() async throws -> FavoritesResponse {
        try await APIClient.shared.send("GET", "/api/favorites")
    }

    func ids() async throws -> FavoriteIdsResponse {
        try await APIClient.shared.send("GET", "/api/favorites/ids")
    }

    func add(listingId: String) async throws -> FavoriteToggleResponse {
        try await APIClient.shared.send("PUT", "/api/favorites/\(listingId)")
    }

    func remove(listingId: String) async throws -> FavoriteToggleResponse {
        try await APIClient.shared.send("DELETE", "/api/favorites/\(listingId)")
    }
}

struct FavoritesResponse: Decodable, Sendable {
    let items: [Listing]
}

struct FavoriteIdsResponse: Decodable, Sendable {
    let ids: [String]
}

struct FavoriteToggleResponse: Decodable, Sendable {
    let ok: Bool
    let favorited: Bool
}
