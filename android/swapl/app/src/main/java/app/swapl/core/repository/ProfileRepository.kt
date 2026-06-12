package app.swapl.core.repository

import app.swapl.core.model.InterestsCatalog
import app.swapl.core.model.MeResponse
import app.swapl.core.model.PublicProfile
import app.swapl.core.model.SavedSearch
import app.swapl.core.model.SavedSearchesResponse
import app.swapl.core.model.UserSettings
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.patch
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

    // PATCH /api/profile — partial update (DOK-147). `name` is skipped when
    // null (the API requires a non-empty name); the other strings are always
    // sent so empty input clears the nullable fields server-side.
    suspend fun updateProfile(body: ProfileUpdateBody) {
        api.client.patch("${api.baseUrl}/api/profile") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    // GET/PATCH /api/profile/settings — privacy & notification toggles.
    suspend fun settings(): UserSettings =
        api.client.get("${api.baseUrl}/api/profile/settings")
            .body<SettingsResponse>().settings

    // Partial merge server-side: omitted (null) keys keep their stored value.
    suspend fun updateSettings(patch: SettingsPatch): UserSettings =
        api.client.patch("${api.baseUrl}/api/profile/settings") {
            contentType(ContentType.Application.Json)
            setBody(patch)
        }.body<SettingsResponse>().settings

    suspend fun interests(): InterestsCatalog =
        api.client.get("${api.baseUrl}/api/profile/interests").body()

    suspend fun saveInterests(slugs: List<String>, bioVibe: String?) =
        api.client.post("${api.baseUrl}/api/profile/interests") {
            contentType(ContentType.Application.Json)
            setBody(InterestsBody(slugs, bioVibe))
        }

    // POST /api/auth/change-password (DOK-149). currentPassword is null when a
    // social/OTP-only account sets its first password; the server keeps THIS
    // device's token valid and revokes every other one.
    suspend fun changePassword(currentPassword: String?, newPassword: String) {
        api.client.post("${api.baseUrl}/api/auth/change-password") {
            contentType(ContentType.Application.Json)
            setBody(ChangePasswordBody(currentPassword, newPassword))
        }
    }

    suspend fun savedSearches(): List<SavedSearch> =
        api.client.get("${api.baseUrl}/api/saved-searches").body<SavedSearchesResponse>().items

    suspend fun report(reason: String, detail: String?, listingId: String?, targetUserId: String?) =
        api.client.post("${api.baseUrl}/api/reports") {
            contentType(ContentType.Application.Json)
            setBody(ReportBody(reason, detail, listingId, targetUserId))
        }

    @Serializable
    data class ProfileUpdateBody(
        // Defaulted to null so kotlinx-serialization omits it from the JSON
        // (encodeDefaults=false) — the stored name is kept rather than rejected.
        val name: String? = null,
        val bio: String,
        val work: String,
        val languages: List<String>,
        val homeCity: String,
        val homeCountry: String,
    )

    @Serializable
    data class SettingsPatch(
        val searchEngineIndexing: Boolean? = null,
        val showHomeCity: Boolean? = null,
        val emailNotifications: Boolean? = null,
        val pushNotifications: Boolean? = null,
    )

    @Serializable
    private data class ChangePasswordBody(
        val currentPassword: String? = null,
        val newPassword: String,
    )

    @Serializable
    private data class SettingsResponse(val settings: UserSettings)

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
