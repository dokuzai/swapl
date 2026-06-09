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
    private data class ActionBody(
        val action: String,
        val counterDateFrom: String? = null,
        val counterDateTo: String? = null,
        val counterMessage: String? = null,
    )
}
