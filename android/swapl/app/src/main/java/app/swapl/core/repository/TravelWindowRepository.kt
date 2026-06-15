package app.swapl.core.repository

import app.swapl.core.model.TravelWindow
import app.swapl.core.model.TravelWindowCreateBody
import app.swapl.core.model.TravelWindowCreateResponse
import app.swapl.core.model.TravelWindowList
import app.swapl.core.model.WindowProposalsResult
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

// Travel windows backend (DOK-161), bearer-authed via ApiClient. Mirrors
// ios/Swapl/Core/Repositories/TravelWindowRepository.swift:
//   - list/create/delete a member's saved "I want to travel around these
//     dates" intents. Create is tier-capped (Free=3, Plus=10, Pro=unlimited);
//     over the cap the POST answers 402 { error, upgradeTo, currentPlan } and
//     ktor raises ClientRequestException, which the view model maps to the
//     server's upsell copy.
//   - GET …/{id}/proposals: the AI's ready-made swap proposals for the window
//     (real, available, date-compatible homes ranked by match + travel
//     profile). Answers 409 { code: NO_ACTIVE_LISTING } when the member has no
//     active home to swap from.
@Singleton
class TravelWindowRepository @Inject constructor(private val api: ApiClient) {

    suspend fun list(): List<TravelWindow> =
        api.client.get("${api.baseUrl}/api/travel-windows").body<TravelWindowList>().items

    /** Throws ClientRequestException (402) over the plan cap — the response
     *  body's `error` is the upsell copy. */
    suspend fun create(
        dateFrom: String,
        dateTo: String,
        flexible: Boolean,
        destinations: List<String>,
        notes: String?,
    ): TravelWindow =
        api.client.post("${api.baseUrl}/api/travel-windows") {
            contentType(ContentType.Application.Json)
            setBody(
                TravelWindowCreateBody(
                    dateFrom = dateFrom,
                    dateTo = dateTo,
                    flexible = flexible,
                    destinations = destinations.ifEmpty { null },
                    notes = notes?.takeIf { it.isNotBlank() },
                ),
            )
        }.body<TravelWindowCreateResponse>().window

    suspend fun delete(id: String) {
        api.client.delete("${api.baseUrl}/api/travel-windows/$id")
    }

    /** The AI proposals for a window. Throws ClientRequestException (409) with
     *  code NO_ACTIVE_LISTING when the member has no active listing to swap
     *  from. */
    suspend fun proposals(windowId: String): WindowProposalsResult =
        api.client.get("${api.baseUrl}/api/travel-windows/$windowId/proposals").body()
}
