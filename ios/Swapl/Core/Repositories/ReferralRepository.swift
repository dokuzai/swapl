import Foundation

// Invite & earn networking (DOK-157). Thin relay over the same /api/referrals
// endpoints the web/Android clients use. All growth economics (tiers, caps,
// waitlist position, the two-sided Keys reward) live server-side; this layer
// never computes them locally — it only reads the dashboard and issues invites.
final class ReferralRepository: @unchecked Sendable {
    static let shared = ReferralRepository()

    // GET /api/referrals — the caller's growth dashboard: shareable code + link,
    // who's joined, points earned, tier progress, waitlist position, leaderboard.
    func dashboard() async throws -> ReferralDashboard {
        try await APIClient.shared.send("GET", "/api/referrals")
    }

    // POST /api/referrals/invite-to-stay — issue an invite tied to one of the
    // caller's own listings. Returns a shareable link carrying an opaque token.
    func inviteToStay(listingId: String, email: String? = nil) async throws -> InviteToStayResponse {
        try await APIClient.shared.send(
            "POST", "/api/referrals/invite-to-stay",
            body: InviteToStayRequest(listingId: listingId, email: email)
        )
    }
}
