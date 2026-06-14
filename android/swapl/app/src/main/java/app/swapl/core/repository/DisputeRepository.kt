package app.swapl.core.repository

import app.swapl.core.model.Dispute
import app.swapl.core.model.DisputeListResponse
import app.swapl.core.model.DisputeMessageBody
import app.swapl.core.model.DisputeMessageResponse
import app.swapl.core.model.OpenDisputeBody
import app.swapl.core.model.OpenDisputeResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

// Dispute / resolution-center networking (DOK-153). Thin relay over the three
// server endpoints; all gating (only the two parties of an agreement) and the
// status machine live server-side. Photos are uploaded ahead of time through
// the shared /api/uploads/listing-photo pipeline (ListingRepository.uploadPhoto),
// so this layer only ever sends back the resulting URL strings.
@Singleton
class DisputeRepository @Inject constructor(private val api: ApiClient) {

    // GET /api/agreements/{id}/dispute — every dispute on the swap, newest first.
    suspend fun list(agreementId: String): List<Dispute> =
        api.client.get("${api.baseUrl}/api/agreements/$agreementId/dispute")
            .body<DisputeListResponse>().disputes

    // POST /api/agreements/{id}/dispute — open a case.
    suspend fun open(
        agreementId: String,
        category: String,
        description: String,
        photos: List<String>,
    ): OpenDisputeResponse =
        api.client.post("${api.baseUrl}/api/agreements/$agreementId/dispute") {
            contentType(ContentType.Application.Json)
            setBody(OpenDisputeBody(category, description, photos.takeIf { it.isNotEmpty() }))
        }.body()

    // POST /api/disputes/{id}/message — reply on an open case.
    suspend fun reply(
        disputeId: String,
        body: String,
        photos: List<String>,
    ): DisputeMessageResponse =
        api.client.post("${api.baseUrl}/api/disputes/$disputeId/message") {
            contentType(ContentType.Application.Json)
            setBody(DisputeMessageBody(body, photos.takeIf { it.isNotEmpty() }))
        }.body()
}
