package app.swapl.core.repository

import app.swapl.core.model.CheckEventBody
import app.swapl.core.model.CheckEventResponse
import app.swapl.core.model.HomeGuidePutResponse
import app.swapl.core.model.HomeGuideResponse
import app.swapl.core.model.HomeGuideUpdate
import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalDetail
import app.swapl.core.model.ProposalSummary
import app.swapl.core.model.TripCockpit
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

// Trips are accepted swaps. The backend has no standalone agreements list
// endpoint — web (/swaps) and iOS both read agreements through the proposals
// API: the inbox "active" bucket is the ACCEPTED list, and the proposal detail
// embeds the agreement (key codes + insurance) for participants. We do the same.
//
// The trip cockpit (DOK-152) layers on top: the per-agreement /trip payload, the
// per-listing home guide GET/PUT, and the check-in/check-out POSTs. All reveal
// gating is server-side — this layer just relays whatever the server chose to
// send (locked hint vs. full content).
@Singleton
class TripsRepository @Inject constructor(private val api: ApiClient) {
    suspend fun trips(): List<ProposalSummary> =
        api.client.get("${api.baseUrl}/api/proposals")
            .body<InboxResponse>().buckets.active

    suspend fun detail(proposalId: String): ProposalDetail =
        api.client.get("${api.baseUrl}/api/proposals/$proposalId").body()

    // GET /api/agreements/{id}/trip
    suspend fun cockpit(agreementId: String): TripCockpit =
        api.client.get("${api.baseUrl}/api/agreements/$agreementId/trip").body()

    // GET /api/listings/{id}/home-guide
    suspend fun homeGuide(listingId: String): HomeGuideResponse =
        api.client.get("${api.baseUrl}/api/listings/$listingId/home-guide").body()

    // PUT /api/listings/{id}/home-guide — owner-only partial upsert.
    suspend fun saveHomeGuide(listingId: String, update: HomeGuideUpdate): HomeGuidePutResponse =
        api.client.put("${api.baseUrl}/api/listings/$listingId/home-guide") {
            contentType(ContentType.Application.Json)
            setBody(update)
        }.body()

    // POST /api/agreements/{id}/check-in | check-out. Idempotent per party.
    suspend fun checkIn(agreementId: String, note: String?, photos: List<String>): CheckEventResponse =
        checkEvent(agreementId, "check-in", note, photos)

    suspend fun checkOut(agreementId: String, note: String?, photos: List<String>): CheckEventResponse =
        checkEvent(agreementId, "check-out", note, photos)

    private suspend fun checkEvent(
        agreementId: String,
        path: String,
        note: String?,
        photos: List<String>,
    ): CheckEventResponse =
        api.client.post("${api.baseUrl}/api/agreements/$agreementId/$path") {
            contentType(ContentType.Application.Json)
            setBody(
                CheckEventBody(
                    note = note?.takeIf { it.isNotBlank() },
                    photos = photos.takeIf { it.isNotEmpty() },
                ),
            )
        }.body()
}
