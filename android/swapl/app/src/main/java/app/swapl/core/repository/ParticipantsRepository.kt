package app.swapl.core.repository

import app.swapl.core.model.ConversationParticipant
import app.swapl.core.model.ParticipantSuggestionsResponse
import app.swapl.core.model.ParticipantsResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

// Conversation participants (DOK-187). The roster (GET) is readable by anyone
// with thread access — both principals and active guests. Inviting and removing
// are principal-only; the API answers 403 for guests, so the UI simply hides
// those controls (ClientRequestException(403) still surfaces defensively).
@Singleton
class ParticipantsRepository @Inject constructor(private val api: ApiClient) {

    // Full roster: the two principals + every active/pending guest.
    suspend fun list(proposalId: String): List<ConversationParticipant> =
        api.client.get("${api.baseUrl}/api/proposals/$proposalId/participants")
            .body<ParticipantsResponse>()
            .participants

    // Principal-only quick-pick of people the caller has already swapped with.
    // Throws ClientRequestException(403) for guests — callers treat that as
    // "no invite powers" and hide the invite affordances.
    suspend fun suggestions(proposalId: String): List<app.swapl.core.model.ParticipantSuggestion> =
        api.client.get("${api.baseUrl}/api/proposals/$proposalId/participants/suggestions")
            .body<ParticipantSuggestionsResponse>()
            .suggestions

    // Invite by existing account (userId / handle) — seats them immediately.
    suspend fun inviteByUserId(proposalId: String, userId: String): ConversationParticipant =
        invite(proposalId, InviteBody(byUserId = userId))

    // Invite by email — an existing account is seated immediately; an unknown
    // address gets a pending seat and an invite email.
    suspend fun inviteByEmail(proposalId: String, email: String): ConversationParticipant =
        invite(proposalId, InviteBody(byEmail = email))

    private suspend fun invite(proposalId: String, body: InviteBody): ConversationParticipant =
        api.client.post("${api.baseUrl}/api/proposals/$proposalId/participants") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()

    // Soft-remove a guest (status -> removed). Idempotent; principals are never
    // removable (the API guards this and answers 403).
    suspend fun remove(proposalId: String, participantId: String) {
        api.client.delete("${api.baseUrl}/api/proposals/$proposalId/participants/$participantId")
    }

    // Exactly one of byUserId / byEmail is sent; nulls are dropped from JSON.
    @Serializable
    private data class InviteBody(
        val byUserId: String? = null,
        val byEmail: String? = null,
    )
}
