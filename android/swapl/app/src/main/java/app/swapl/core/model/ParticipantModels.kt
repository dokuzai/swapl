package app.swapl.core.model

import kotlinx.serialization.Serializable

// Conversation participants (DOK-187). Anyone in a swap thread can host a few
// extra people in the conversation — a partner, a co-traveler, a friend who's
// coming along. Those guests read and write in the thread like everyone else,
// but they never get any power over the swap itself (accept / counter / cancel
// stay with the two principals).
//
// Mirrors GET /api/proposals/{id}/participants. The two principals are
// materialized server-side with synthetic ids "principal:<userId>"; only guests
// are real rows. `role` is "principal" | "guest_participant"; `status` is
// "active" | "pending" | "removed" (removed rows are not returned).
@Serializable
data class ConversationParticipant(
    val id: String,
    val userId: String? = null,
    val invitedEmail: String? = null,
    val name: String? = null,
    val avatar: String? = null,
    val role: String, // "principal" | "guest_participant"
    val status: String, // "active" | "pending"
) {
    val isPrincipal: Boolean get() = role == "principal"
    val isPending: Boolean get() = status == "pending"
    // A friendly label even before a pending invitee has an account/name.
    val displayName: String get() = name ?: invitedEmail ?: ""
}

@Serializable
data class ParticipantsResponse(
    val participants: List<ConversationParticipant> = emptyList(),
)

// GET /api/proposals/{id}/participants/suggestions — principal-only quick-pick:
// accounts the caller has already swapped with, safe to surface as one-tap
// invites. A 403 here means the viewer is a guest (no invite powers).
@Serializable
data class ParticipantSuggestion(
    val userId: String,
    val name: String? = null,
    val avatar: String? = null,
) {
    val displayName: String get() = name ?: "Swapl member"
}

@Serializable
data class ParticipantSuggestionsResponse(
    val suggestions: List<ParticipantSuggestion> = emptyList(),
)
