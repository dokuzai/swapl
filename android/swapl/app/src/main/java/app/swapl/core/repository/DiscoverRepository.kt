package app.swapl.core.repository

import app.swapl.core.model.DiscoverExperiencesResponse
import app.swapl.core.model.DiscoverService
import app.swapl.core.model.DiscoverExperience
import app.swapl.core.model.DiscoverServicesResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import javax.inject.Inject
import javax.inject.Singleton

// GET /api/discover/services and /api/discover/experiences — the public,
// env-gated affiliate catalogue (DOK-145). Partners without an AFF_* id never
// appear, so an empty `items` array is a normal "nothing configured" answer.
// Affiliate URLs come back RELATIVE (/api/affiliate/{partner}?…) so every
// click is logged as an AffiliateClick before the 302 — resolve them against
// the API origin with `resolveUrl` before opening.
@Singleton
class DiscoverRepository @Inject constructor(private val api: ApiClient) {

    suspend fun services(): List<DiscoverService> =
        api.client.get("${api.baseUrl}/api/discover/services")
            .body<DiscoverServicesResponse>().items

    suspend fun experiences(city: String? = null): List<DiscoverExperience> =
        api.client.get("${api.baseUrl}/api/discover/experiences") {
            city?.trim()?.takeIf { it.isNotEmpty() }?.let { parameter("city", it) }
        }.body<DiscoverExperiencesResponse>().items

    /** Resolves a possibly-relative affiliate href against the API origin so
     *  the click-through still hits the logging redirector. */
    fun resolveUrl(raw: String): String =
        if (raw.startsWith("http://") || raw.startsWith("https://")) raw
        else api.baseUrl.trimEnd('/') + (if (raw.startsWith("/")) raw else "/$raw")
}
