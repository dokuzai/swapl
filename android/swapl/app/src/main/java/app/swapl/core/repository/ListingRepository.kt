package app.swapl.core.repository

import app.swapl.core.model.ListingDetailResponse
import app.swapl.core.model.ListingSearchResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ListingRepository @Inject constructor(private val api: ApiClient) {
    suspend fun search(filters: SearchFilters): ListingSearchResponse =
        api.client.get("${api.baseUrl}/api/listings") {
            filters.cities.takeIf { it.isNotEmpty() }?.let { parameter("city", it.joinToString(",")) }
            filters.propertyTypes.takeIf { it.isNotEmpty() }?.let { parameter("type", it.joinToString(",")) }
            if (filters.minSqm > 30) parameter("minSqm", filters.minSqm)
            if (filters.minSleeps > 1) parameter("minSleeps", filters.minSleeps)
            if (filters.petsRequired) parameter("pets", "1")
            if (filters.wfhRequired) parameter("wfh", "1")
            if (filters.stepFreeRequired) parameter("stepFree", "1")
            filters.dateFrom?.let { parameter("from", it) }
            filters.dateTo?.let { parameter("to", it) }
            if (filters.sort != "match") parameter("sort", filters.sort)
            if (filters.page > 1) parameter("page", filters.page)
        }.body()

    suspend fun detail(id: String): ListingDetailResponse =
        api.client.get("${api.baseUrl}/api/listings/$id").body()
}

data class SearchFilters(
    val cities: List<String> = emptyList(),
    val propertyTypes: List<String> = emptyList(),
    val minSqm: Int = 30,
    val minSleeps: Int = 1,
    val petsRequired: Boolean = false,
    val wfhRequired: Boolean = false,
    val stepFreeRequired: Boolean = false,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val sort: String = "match",
    val page: Int = 1,
)
