package app.swapl.core.model

import androidx.annotation.StringRes
import app.swapl.R
import kotlinx.serialization.Serializable

// Invite & earn — the growth/referral dashboard (DOK-157). These mirror the web
// API in app/app/api/referrals/route.ts and the iOS Referral.swift models exactly
// so the same backend serves all clients. BINDING PRINCIPLE: referrals earn KEYS
// ("travel points"), never money; the reward credits only once an invited friend
// verifies their identity, and bringing more people OPENS THE GATE — it climbs
// the waitlist and leaderboard.

// GET /api/referrals — the caller's growth dashboard.
@Serializable
data class ReferralDashboard(
    val code: String,
    val shareUrl: String,
    val invitesSent: Int = 0,
    val joined: List<JoinedReferral> = emptyList(),
    val keysEarned: Int = 0,
    val qualifiedCount: Int = 0,
    val rewardPerReferral: Int = 0,
    val tierProgress: TierProgress = TierProgress(),
    val waitlistPosition: Int = 0,
    val leaderboardTop: List<LeaderboardEntry> = emptyList(),
) {
    @Serializable
    data class JoinedReferral(
        val name: String? = null,
        val status: String,   // pending | qualified | rewarded
        val source: String,   // link | invite_to_stay
    ) {
        val displayName: String get() = name ?: "A friend"

        // Verified friends are the ones that paid out points — surface that.
        val isQualified: Boolean get() = status == "qualified" || status == "rewarded"

        val statusLabel: String
            get() = when (status) {
                "rewarded" -> "Verified · points earned"
                "qualified" -> "Verified"
                else -> "Invited · waiting to verify"
            }

        val sourceLabel: String
            get() = if (source == "invite_to_stay") "Invited to stay" else "Shared link"
    }

    @Serializable
    data class TierProgress(
        val current: Tier? = null,
        val next: NextTier? = null,
    ) {
        @Serializable
        data class Tier(val key: String, val label: String, val perk: String)

        @Serializable
        data class NextTier(
            val key: String,
            val label: String,
            val threshold: Int,
            val remaining: Int,
        )
    }

    @Serializable
    data class LeaderboardEntry(
        val rank: Int,
        val name: String? = null,
        val qualified: Int,
        val isYou: Boolean = false,
    ) {
        val displayName: String get() = if (isYou) "You" else (name ?: "A member")
    }
}

// GET /api/referrals/notifications — the referrer's rewarded-but-unseen referral
// credits, for the real-time referrer toast (DOK-157). While the app is open the
// referrer polls this and acks shown credits so each toasts exactly once.
@Serializable
data class ReferrerNotification(
    val id: String,
    val refereeName: String? = null,
    val keys: Int = 0,
    val rewardedAt: String? = null,
) {
    val displayName: String get() = refereeName ?: "Someone you invited"
}

@Serializable
data class ReferrerNotificationsResponse(
    val notifications: List<ReferrerNotification> = emptyList(),
)

@Serializable
data class AckReferrerNotificationsRequest(
    val ids: List<String>,
)

@Serializable
data class AckReferrerNotificationsResponse(
    val ok: Boolean = false,
    val seen: Int = 0,
)

// POST /api/referrals/invite-to-stay — issue an invite tied to one of the
// caller's own listings. Returns a shareable link carrying an opaque token.
@Serializable
data class InviteToStayRequest(
    val listingId: String,
    val email: String? = null,
)

@Serializable
data class InviteToStayResponse(
    val ok: Boolean = false,
    val referralId: String,
    val token: String,
    val shareUrl: String,
    val listing: InvitedListing,
) {
    @Serializable
    data class InvitedListing(val id: String, val title: String)
}

// GET /api/keys/transactions?kind=&cursor=&limit= — paginated, kind-filterable
// view of the caller's Keys ledger. Each row carries balanceAfter (the running
// balance), so the client renders a progressive balance with no local math.
@Serializable
data class KeysTransactionsResponse(
    val transactions: List<KeysTransaction> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
)

// Category partition for the filterable ledger, mirroring iOS
// KeysTransactionCategory. "All" sends no kind filter; Earned/Spent are derived
// client-side from the signed delta so a single fetch backs every tab.
enum class KeysTransactionCategory(@StringRes val labelRes: Int, @StringRes val emptyRes: Int) {
    ALL(R.string.keys_tx_filter_all, R.string.keys_tx_empty_all),
    EARNED(R.string.keys_tx_filter_earned, R.string.keys_tx_empty_earned),
    SPENT(R.string.keys_tx_filter_spent, R.string.keys_tx_empty_spent);

    fun matches(tx: KeysTransaction): Boolean = when (this) {
        ALL -> true
        EARNED -> tx.delta >= 0
        SPENT -> tx.delta < 0
    }
}
