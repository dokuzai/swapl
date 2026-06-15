package app.swapl.core.model

import kotlinx.serialization.Serializable

// Keys wallet + Stay-with-Keys models (DOK-155). Keys are "travel points",
// never money: they cannot be bought or cashed out, only earned, spent on a
// stay, or gifted to a verified friend. These mirror the web API in
// app/app/api/keys/* and the iOS Keys.swift models exactly so the same backend
// serves all clients.

// GET /api/keys — the caller's wallet.
@Serializable
data class KeysWallet(
    val balance: Int,
    val nightlyKeysForMyListings: List<NightlyKeysListing> = emptyList(),
    val recentTransactions: List<KeysTransaction> = emptyList(),
    // Embedded "ways to earn Keys" surface (DOK-164). Null on older servers; the
    // wallet falls back to a standalone GET /api/keys/earn-ways fetch.
    val earnWays: EarnWaysPayload? = null,
) {
    @Serializable
    data class NightlyKeysListing(
        val listingId: String,
        val title: String,
        val nightlyKeys: Int,
    )
}

@Serializable
data class KeysTransaction(
    val id: String,
    val delta: Int,          // signed: +earned / -spent
    val kind: String,        // welcome | spend_stay | earn_host | hold | release | gift_sent | gift_received | ...
    val balanceAfter: Int,
    val stayId: String? = null,
    val note: String? = null,
    val createdAt: String,
) {
    // Human label for the ledger row. Falls back to the raw kind so an unknown
    // future kind still renders sensibly. Mirrors KeysTransaction.displayLabel
    // on iOS and the web KIND_KEY map.
    val displayLabel: String
        get() = when (kind) {
            "welcome", "welcome_bonus" -> "Welcome points"
            "spend_stay" -> "Stay booked"
            "earn_host" -> "Hosted a stay"
            "hold" -> "Held for a stay"
            "release" -> "Hold released"
            "refund" -> "Refund"
            "gift_sent" -> "Gift sent"
            "gift_received" -> "Gift received"
            "referral_bonus" -> "Referral reward"
            "invite_bonus" -> "Invite bonus"
            // Ways-to-earn bonuses (DOK-164). Mirrors keysKindLabel on the web.
            "earn_property_verified" -> "Property verified"
            "earn_review" -> "Review left"
            "earn_share_converted" -> "Your share booked a stay"
            "earn_listing_complete" -> "Listing completed"
            else -> kind.replace('_', ' ').replaceFirstChar { it.uppercase() }
        }
}

// GET /api/listings/{id}/keys-availability — nightly Keys + bookable window.
@Serializable
data class KeysAvailability(
    val listingId: String,
    val nightlyKeys: Int,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int,
    val maxStayDays: Int,
    val bookedRanges: List<BookedRange> = emptyList(),
) {
    @Serializable
    data class BookedRange(
        val dateFrom: String,
        val dateTo: String,
    )
}

// GET /api/keys/stays — the caller's stays, both as guest and host.
@Serializable
data class KeysStay(
    val id: String,
    val role: String,        // guest | host
    val listing: StayListing,
    val dateFrom: String,
    val dateTo: String,
    val nights: Int,
    val keysCost: Int,
    val status: String,      // pending | confirmed | declined | cancelled | completed
    val insurancePolicyId: String? = null,
    val createdAt: String,
) {
    @Serializable
    data class StayListing(
        val id: String,
        val title: String,
        val city: String,
    )

    val isGuest: Boolean get() = role == "guest"
    val isPending: Boolean get() = status == "pending"
}

@Serializable
data class KeysStaysResponse(val stays: List<KeysStay> = emptyList())

// POST /api/keys/stays
@Serializable
data class KeysStayRequest(
    val listingId: String,
    val dateFrom: String,
    val dateTo: String,
)

@Serializable
data class KeysStayCreateResponse(
    val ok: Boolean = false,
    val stayId: String,
    val status: String,
    val nights: Int,
    val keysCost: Int,
)

// POST /api/keys/gift
@Serializable
data class KeysGiftRequest(
    val toUserId: String,
    val amount: Int,
)

@Serializable
data class KeysGiftResponse(
    val ok: Boolean = false,
    val amount: Int,
    val balanceAfter: Int,
    val recipientBalanceAfter: Int,
)

// POST /api/keys/stays/{id}/confirm | decline | cancel
@Serializable
data class KeysStayActionResponse(
    val ok: Boolean = false,
    val stayId: String,
    val keysCost: Int? = null,
)

// GET /api/keys/earn-ways — the "Ways to earn Keys" catalogue (DOK-164). A
// server-owned list of the actions that mint Keys, each with its amount, whether
// it's a one-time or repeatable earn, the identity gate, and (per user) whether
// the member has already done it. Mirrors EarnWaysPayload in
// lib/keys/earn-ways-dto.ts so every client shows the same surface; the wallet
// also embeds this payload via the `earnWays` field of GET /api/keys.
@Serializable
data class EarnWaysPayload(
    // Whether the caller's identity is verified — gated rows stay locked until true.
    val identityVerified: Boolean = false,
    val ways: List<EarnWay> = emptyList(),
)

@Serializable
data class EarnWay(
    // Stable action id — drives copy / icon on the client.
    // verify_identity | verify_property | complete_listing | leave_review |
    // share_converted | refer_friend
    val key: String,
    val amount: Int,            // Keys minted by the action.
    val repeatable: Boolean = false,
    val gatedOnIdentity: Boolean = false,
    val kind: String = "",      // The ledger kind this action produces.
    val done: Boolean = false,  // Whether the user has earned this kind at least once.
)
