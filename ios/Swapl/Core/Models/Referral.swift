import Foundation

// Invite & earn — the growth/referral dashboard (DOK-157). These mirror the web
// API in app/app/api/referrals/route.ts exactly so the same backend serves all
// clients. BINDING PRINCIPLE: referrals earn KEYS ("travel points"), never money;
// the reward credits only once an invited friend verifies their identity, and
// bringing more people OPENS THE GATE — it climbs the waitlist and leaderboard.

// MARK: - Dashboard (GET /api/referrals)

struct ReferralDashboard: Decodable, Sendable {
    let code: String
    let shareUrl: String
    let invitesSent: Int
    let joined: [JoinedReferral]
    let keysEarned: Int
    let qualifiedCount: Int
    let rewardPerReferral: Int
    let tierProgress: TierProgress
    let waitlistPosition: Int
    let leaderboardTop: [LeaderboardEntry]

    struct JoinedReferral: Decodable, Sendable, Identifiable {
        let name: String?
        let status: String   // "pending" | "qualified" | "rewarded"
        let source: String   // "link" | "invite_to_stay"

        // No server id on the row; the dashboard renders them in a stable order.
        let id = UUID()

        private enum CodingKeys: String, CodingKey { case name, status, source }

        var displayName: String { name ?? String(localized: "A friend") }

        // Verified friends are the ones that paid out points — surface that.
        var isQualified: Bool { status == "qualified" || status == "rewarded" }

        var statusLabel: String {
            switch status {
            case "rewarded": return "Verified · points earned"
            case "qualified": return "Verified"
            default: return String(localized: "Invited · waiting to verify")
            }
        }

        var sourceLabel: String {
            source == "invite_to_stay" ? "Invited to stay" : "Shared link"
        }
    }

    struct TierProgress: Decodable, Sendable {
        let current: Tier?
        let next: NextTier?

        struct Tier: Decodable, Sendable {
            let key: String
            let label: String
            let perk: String
        }

        struct NextTier: Decodable, Sendable {
            let key: String
            let label: String
            let threshold: Int
            let remaining: Int
        }
    }

    struct LeaderboardEntry: Decodable, Sendable, Identifiable {
        let rank: Int
        let name: String?
        let qualified: Int
        let isYou: Bool

        var id: Int { rank }
        var displayName: String { isYou ? String(localized: "You") : (name ?? String(localized: "A member")) }
    }
}

// MARK: - Referrer real-time notifications (GET /api/referrals/notifications)
//
// Closes the dopamine loop (DOK-157): while the app is open, the referrer polls
// for rewarded-but-unseen referral credits ("NAME just verified — you earned 20
// Keys!") and acks them so each toasts exactly once. Mirrors the web client.

struct ReferrerNotification: Decodable, Sendable, Identifiable {
    let id: String
    let refereeName: String?
    let keys: Int
    let rewardedAt: String?

    var displayName: String { refereeName ?? String(localized: "Someone you invited") }
}

struct ReferrerNotificationsResponse: Decodable, Sendable {
    let notifications: [ReferrerNotification]
}

struct AckReferrerNotificationsRequest: Encodable, Sendable {
    let ids: [String]
}

struct AckReferrerNotificationsResponse: Decodable, Sendable {
    let ok: Bool
    let seen: Int
}

// MARK: - Invite to stay (POST /api/referrals/invite-to-stay)

struct InviteToStayRequest: Encodable, Sendable {
    let listingId: String
    let email: String?
}

struct InviteToStayResponse: Decodable, Sendable {
    let ok: Bool
    let referralId: String
    let token: String
    let shareUrl: String
    let listing: InvitedListing

    struct InvitedListing: Decodable, Sendable {
        let id: String
        let title: String
    }
}
