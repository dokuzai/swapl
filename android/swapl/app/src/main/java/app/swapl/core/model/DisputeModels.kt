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
    val title: String,
    val subtitle: String,
) {
    ACCESS("access", "Can't get in", "Locked out, wrong code, keys missing"),
    DAMAGE("damage", "Damage", "Something got broken or damaged"),
    CLEANLINESS("cleanliness", "Cleanliness", "The home wasn't ready or clean"),
    SAFETY("safety", "Safety concern", "You feel unsafe or something's wrong"),
    NO_SHOW("no_show", "No-show", "Your swap partner didn't follow through"),
    OTHER("other", "Something else", "Anything else you need help with");

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
enum class DisputeStatus(val raw: String, val label: String) {
    OPEN("open", "Open"),
    INVESTIGATING("investigating", "We're on it"),
    AWAITING_RESPONSE("awaiting_response", "Your move"),
    RESOLVED("resolved", "Resolved"),
    CLOSED("closed", "Closed");

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
