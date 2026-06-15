package app.swapl.core.repository

import app.swapl.core.model.KeysAvailability
import app.swapl.core.model.KeysGiftRequest
import app.swapl.core.model.KeysGiftResponse
import app.swapl.core.model.KeysStayActionResponse
import app.swapl.core.model.KeysStayCreateResponse
import app.swapl.core.model.KeysStayRequest
import app.swapl.core.model.KeysStaysResponse
import app.swapl.core.model.KeysWallet
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

// Keys wallet + Stay-with-Keys networking (DOK-155). A thin relay over the same
// /api/keys endpoints the web/iOS clients use. The credit ledger lives
// server-side; this layer never computes balances or costs locally.
@Singleton
class KeysRepository @Inject constructor(private val api: ApiClient) {

    // GET /api/keys — the caller's wallet: balance, nightly-Keys for their own
    // listings, and recent ledger transactions.
    suspend fun wallet(): KeysWallet =
        api.client.get("${api.baseUrl}/api/keys").body()

    // GET /api/listings/{id}/keys-availability — nightly Keys + bookable window
    // for a Stay-with-Keys on this listing.
    suspend fun availability(listingId: String): KeysAvailability =
        api.client.get("${api.baseUrl}/api/listings/$listingId/keys-availability").body()

    // GET /api/keys/stays — the caller's stays, both as guest and host.
    suspend fun stays(): KeysStaysResponse =
        api.client.get("${api.baseUrl}/api/keys/stays").body()

    // POST /api/keys/stays — request a stay. Holds the guest's Keys and notifies
    // the host. A 422 with "enough" in the body means insufficient balance.
    suspend fun requestStay(listingId: String, dateFrom: String, dateTo: String): KeysStayCreateResponse =
        api.client.post("${api.baseUrl}/api/keys/stays") {
            contentType(ContentType.Application.Json)
            setBody(KeysStayRequest(listingId = listingId, dateFrom = dateFrom, dateTo = dateTo))
        }.body()

    // POST /api/keys/gift — gift Keys to a verified member. Never overdraws.
    suspend fun gift(toUserId: String, amount: Int): KeysGiftResponse =
        api.client.post("${api.baseUrl}/api/keys/gift") {
            contentType(ContentType.Application.Json)
            setBody(KeysGiftRequest(toUserId = toUserId, amount = amount))
        }.body()

    // Host confirms a pending stay → the hold becomes a real spend/earn and a
    // cover policy is issued server-side.
    suspend fun confirmStay(id: String): KeysStayActionResponse = stayAction(id, "confirm")

    // Host declines a pending stay → the guest's hold is released.
    suspend fun declineStay(id: String): KeysStayActionResponse = stayAction(id, "decline")

    // Guest cancels their own pending stay → the hold is released.
    suspend fun cancelStay(id: String): KeysStayActionResponse = stayAction(id, "cancel")

    // The confirm/decline/cancel routes take no body; send an empty JSON object
    // so the Content-Type header is set and Next's req.json() doesn't choke.
    private suspend fun stayAction(id: String, path: String): KeysStayActionResponse =
        api.client.post("${api.baseUrl}/api/keys/stays/$id/$path") {
            contentType(ContentType.Application.Json)
            setBody(EmptyBody)
        }.body()

    @Serializable
    private object EmptyBody
}
