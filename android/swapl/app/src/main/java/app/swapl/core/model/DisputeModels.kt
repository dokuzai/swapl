package app.swapl.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Dispute / resolution-center models (DOK-153). Mirror:
//   POST/GET app/app/api/agreements/[id]/dispute
//   POST     app/app/api/disputes/[id]/message
//
// The web layer (lib/disputes) owns the contract: the category vocabulary, the
// "urgent" set that foregrounds the 24/7 line (safety + access), and the status
// machine. The server stamps `urgent` and `status` on every payload, so the
// client never has to re-derive that policy — it just renders what it's told.

// The fixed category vocabulary (lib/disputes DISPUTE_CATEGORIES). `isUrgent` is
// a client-side convenience for the picker copy; the SERVER is the source of
// truth for whether a given dispute is urgent (it stamps `dispute.urgent`).
enum class DisputeCategory(
    val raw: String,
    @androidx.annotation.StringRes val titleRes: Int,
    @androidx.annotation.StringRes val subtitleRes: Int,
) {
    ACCESS("access", app.swapl.R.string.dispute_cat_access_title, app.swapl.R.string.dispute_cat_access_subtitle),
    DAMAGE("damage", app.swapl.R.string.dispute_cat_damage_title, app.swapl.R.string.dispute_cat_damage_subtitle),
    CLEANLINESS("cleanliness", app.swapl.R.string.dispute_cat_cleanliness_title, app.swapl.R.string.dispute_cat_cleanliness_subtitle),
    SAFETY("safety", app.swapl.R.string.dispute_cat_safety_title, app.swapl.R.string.dispute_cat_safety_subtitle),
    NO_SHOW("no_show", app.swapl.R.string.dispute_cat_no_show_title, app.swapl.R.string.dispute_cat_no_show_subtitle),
    OTHER("other", app.swapl.R.string.dispute_cat_other_title, app.swapl.R.string.dispute_cat_other_subtitle);

    // Mirrors URGENT_CATEGORIES in lib/disputes — locked out / unsafe can't wait
    // on a queue, so the picker surfaces the 24/7 line straight away.
    val isUrgent: Boolean get() = this == ACCESS || this == SAFETY

    companion object {
        // Tolerates any value the server might add later by falling back to OTHER.
        fun fromRaw(raw: String): DisputeCategory =
            entries.firstOrNull { it.raw == raw } ?: OTHER
    }
}

// The dispute status machine (lib/disputes). resolved|closed are terminal and
// accept no new messages (TERMINAL_STATUSES on the server).
enum class DisputeStatus(val raw: String, @androidx.annotation.StringRes val labelRes: Int) {
    OPEN("open", app.swapl.R.string.dispute_status_open),
    INVESTIGATING("investigating", app.swapl.R.string.dispute_status_investigating),
    AWAITING_RESPONSE("awaiting_response", app.swapl.R.string.dispute_status_awaiting),
    RESOLVED("resolved", app.swapl.R.string.dispute_status_resolved),
    CLOSED("closed", app.swapl.R.string.dispute_status_closed);

    val isTerminal: Boolean get() = this == RESOLVED || this == CLOSED

    companion object {
        // Unknown / future status strings degrade to OPEN so an unexpected server
        // value never breaks rendering of the whole timeline.
        fun fromRaw(raw: String): DisputeStatus =
            entries.firstOrNull { it.raw == raw } ?: OPEN
    }
}

@Serializable
data class Dispute(
    val id: String,
    val category: String,
    val urgent: Boolean,
    val status: String,
    val description: String,
    val photos: List<String> = emptyList(),
    val resolution: String? = null,
    val openedBy: DisputeParty,
    val createdAt: String,
    val updatedAt: String,
    val messages: List<DisputeMessage> = emptyList(),
) {
    val categoryKind: DisputeCategory get() = DisputeCategory.fromRaw(category)
    val statusKind: DisputeStatus get() = DisputeStatus.fromRaw(status)
}

@Serializable
data class DisputeParty(
    val id: String,
    val name: String? = null,
)

@Serializable
data class DisputeMessage(
    val id: String,
    val authorId: String,
    val authorName: String? = null,
    val body: String,
    val photos: List<String> = emptyList(),
    val createdAt: String,
)

// GET /api/agreements/{id}/dispute — all disputes on the agreement, newest first.
@Serializable
data class DisputeListResponse(
    val disputes: List<Dispute> = emptyList(),
)

// POST /api/agreements/{id}/dispute
@Serializable
data class OpenDisputeBody(
    val category: String,
    val description: String,
    val photos: List<String>? = null,
)

@Serializable
data class OpenDisputeResponse(
    val ok: Boolean = false,
    val dispute: OpenedDispute,
) {
    @Serializable
    data class OpenedDispute(
        val id: String,
        val category: String,
        val urgent: Boolean,
        val status: String,
        val description: String,
        val photos: List<String> = emptyList(),
        val createdAt: String,
    )
}

// POST /api/disputes/{id}/message
@Serializable
data class DisputeMessageBody(
    val body: String,
    val photos: List<String>? = null,
)

@Serializable
data class DisputeMessageResponse(
    val ok: Boolean = false,
    val status: String,
    val message: DisputeMessage,
)
