package app.swapl.core.repository

import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalDetail
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProposalRepository @Inject constructor(private val api: ApiClient) {
    suspend fun inbox(): InboxResponse =
        api.client.get("${api.baseUrl}/api/proposals").body()

    suspend fun detail(id: String): ProposalDetail =
        api.client.get("${api.baseUrl}/api/proposals/$id").body()

    suspend fun create(body: CreateBody): CreateResponse =
        api.client.post("${api.baseUrl}/api/proposals") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()

    // The backend uses a Zod discriminated union {action: "accept"|...}; we
    // pass a plain map and let kotlinx-serialization emit it as JSON.
    suspend fun accept(id: String): ActionResponse = postAction(id, ActionBody(action = "accept"))
    suspend fun decline(id: String): ActionResponse = postAction(id, ActionBody(action = "decline"))
    suspend fun withdraw(id: String): ActionResponse = postAction(id, ActionBody(action = "withdraw"))
    suspend fun counter(
        id: String,
        from: String,
        to: String,
        message: String? = null,
    ): ActionResponse = postAction(id, ActionBody(
        action = "counter",
        counterDateFrom = from,
        counterDateTo = to,
        counterMessage = message,
    ))

    // Server-side AI draft of the proposal cover message (same endpoint as the
    // web flow); the backend falls back to a template when no AI key is set.
    suspend fun draftMessage(
        proposerListingId: String,
        targetListingId: String,
        dateFrom: String? = null,
        dateTo: String? = null,
    ): AiDraftResponse =
        api.client.post("${api.baseUrl}/api/ai/proposal-message") {
            contentType(ContentType.Application.Json)
            setBody(AiDraftBody(proposerListingId, targetListingId, dateFrom, dateTo))
        }.body()

    // POST /api/agreements/{id}/review — one review per author per COMPLETED
    // agreement (DOK-147). Server validates rating 1-5 and text 20-1000 chars.
    suspend fun submitReview(agreementId: String, rating: Int, text: String) {
        api.client.post("${api.baseUrl}/api/agreements/$agreementId/review") {
            contentType(ContentType.Application.Json)
            setBody(ReviewBody(rating, text))
        }
    }

    private suspend fun postAction(id: String, body: ActionBody): ActionResponse =
        api.client.post("${api.baseUrl}/api/proposals/$id") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()

    @Serializable
    data class CreateBody(
        val proposerListingId: String,
        val targetListingId: String,
        val dateFrom: String,
        val dateTo: String,
        val message: String? = null,
    )

    @Serializable
    data class CreateResponse(val ok: Boolean, val id: String)

    @Serializable
    data class ActionResponse(val ok: Boolean, val agreementId: String? = null)

    @Serializable
    data class AiDraftResponse(val message: String, val source: String? = null)

    @Serializable
    private data class AiDraftBody(
        val proposerListingId: String,
        val targetListingId: String,
        val dateFrom: String? = null,
        val dateTo: String? = null,
    )

    @Serializable
    private data class ReviewBody(val rating: Int, val text: String)

    @Serializable
    private data class ActionBody(
        val action: String,
        val counterDateFrom: String? = null,
        val counterDateTo: String? = null,
        val counterMessage: String? = null,
    )
}
