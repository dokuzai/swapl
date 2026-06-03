package app.swapl.core.repository

import app.swapl.core.model.InterestsCatalog
import app.swapl.core.model.MeResponse
import app.swapl.core.model.PublicProfile
import app.swapl.core.model.SavedSearch
import app.swapl.core.model.SavedSearchesResponse
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
class ProfileRepository @Inject constructor(private val api: ApiClient) {

    suspend fun me(): MeResponse =
        api.client.get("${api.baseUrl}/api/me").body()

    suspend fun publicProfile(id: String): PublicProfile =
        api.client.get("${api.baseUrl}/api/profiles/$id").body()

    suspend fun interests(): InterestsCatalog =
        api.client.get("${api.baseUrl}/api/profile/interests").body()

    suspend fun saveInterests(slugs: List<String>, bioVibe: String?) =
        api.client.post("${api.baseUrl}/api/profile/interests") {
            contentType(ContentType.Application.Json)
            setBody(InterestsBody(slugs, bioVibe))
        }

    suspend fun savedSearches(): List<SavedSearch> =
        api.client.get("${api.baseUrl}/api/saved-searches").body<SavedSearchesResponse>().items

    suspend fun report(reason: String, detail: String?, listingId: String?, targetUserId: String?) =
        api.client.post("${api.baseUrl}/api/reports") {
            contentType(ContentType.Application.Json)
            setBody(ReportBody(reason, detail, listingId, targetUserId))
        }

    @Serializable
    private data class InterestsBody(
        val interests: List<String>,
        val bioVibe: String? = null,
    )

    @Serializable
    private data class ReportBody(
        val reason: String,
        val detail: String? = null,
        val listingId: String? = null,
        val targetUserId: String? = null,
    )
}
