import Foundation

// "Your Swapl story" networking (DOK-158). Thin relay over GET /api/me/story —
// the same endpoint the web client uses. The timeline, counts and referral code
// are all computed server-side from COMPLETED swaps and completed Keys stays;
// this layer only reads them.
final class StoryRepository: @unchecked Sendable {
    static let shared = StoryRepository()

    // GET /api/me/story — the caller's travel/hosting timeline, headline counts,
    // and shareable referral code. Bearer-authed; 401 when unauthenticated.
    func myStory() async throws -> SwaplStory {
        try await APIClient.shared.send("GET", "/api/me/story")
    }
}
