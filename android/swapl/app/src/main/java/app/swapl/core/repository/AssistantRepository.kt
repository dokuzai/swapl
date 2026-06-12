package app.swapl.core.repository

import app.swapl.core.model.InspirePackage
import app.swapl.core.model.TravelProfile
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

// AI assistant backend (DOK-146), bearer-authed via ApiClient:
//   - the transparent travel profile (built ONLY from in-app signals; the
//     user can read it verbatim, refresh it, and delete it),
//   - the "Get Inspired" package flow: compose a draft from REAL active
//     listings, then confirm (creates an actual proposal through the same
//     code path as POST /api/proposals — plan limits & suspension apply)
//     or dismiss.
// Degrades server-side without an AI key (deterministic composition), so
// every endpoint always answers with the same shapes.
@Singleton
class AssistantRepository @Inject constructor(private val api: ApiClient) {

    // MARK: travel profile

    suspend fun profile(): TravelProfile =
        api.client.get("${api.baseUrl}/api/assistant/profile").body()

    /** Rebuild from the latest in-app signals. 429 after 5/hour. */
    suspend fun refreshProfile(): TravelProfile =
        api.client.post("${api.baseUrl}/api/assistant/profile/refresh").body()

    /** Transparency: erases the synthesised profile entirely. */
    suspend fun deleteProfile() {
        api.client.delete("${api.baseUrl}/api/assistant/profile")
    }

    // MARK: Get Inspired

    /** Composes a draft package. 422 with codes NO_ACTIVE_LISTING /
     *  NO_CANDIDATES; 429 after 10/hour. */
    suspend fun inspire(prompt: String?, dateFrom: String?, dateTo: String?): InspirePackage =
        api.client.post("${api.baseUrl}/api/assistant/inspire") {
            contentType(ContentType.Application.Json)
            setBody(InspireBody(prompt, dateFrom, dateTo))
        }.body()

    /** Turns the draft into a REAL proposal (same path as POST /api/proposals,
     *  so 402 plan-limit upsells and suspension refusals propagate verbatim). */
    suspend fun confirm(
        packageId: String,
        listingId: String?,
        dateFrom: String?,
        dateTo: String?,
        message: String?,
    ): ConfirmResponse =
        api.client.post("${api.baseUrl}/api/assistant/inspire/$packageId/confirm") {
            contentType(ContentType.Application.Json)
            setBody(ConfirmBody(listingId, dateFrom, dateTo, message))
        }.body()

    suspend fun dismiss(packageId: String) {
        api.client.post("${api.baseUrl}/api/assistant/inspire/$packageId/dismiss")
    }

    /** Resolves a possibly-relative affiliate href against the API origin so
     *  the click-through still hits the logging redirector. */
    fun resolveUrl(raw: String): String =
        if (raw.startsWith("http://") || raw.startsWith("https://")) raw
        else api.baseUrl.trimEnd('/') + (if (raw.startsWith("/")) raw else "/$raw")

    @Serializable
    data class ConfirmResponse(val ok: Boolean, val proposalId: String, val packageId: String)

    @Serializable
    private data class InspireBody(
        val prompt: String? = null,
        /** yyyy-MM-dd */
        val dateFrom: String? = null,
        val dateTo: String? = null,
    )

    @Serializable
    private data class ConfirmBody(
        /** Must be the destination or one of the alternatives. */
        val listingId: String? = null,
        val dateFrom: String? = null,
        val dateTo: String? = null,
        val message: String? = null,
    )
}
