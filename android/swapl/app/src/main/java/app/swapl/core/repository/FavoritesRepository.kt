package app.swapl.core.repository

import app.swapl.core.model.FavoriteIdsResponse
import app.swapl.core.model.FavoriteToggleResponse
import app.swapl.core.model.FavoritesResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.put
import javax.inject.Inject
import javax.inject.Singleton

// Wishlist endpoints (bearer-authed via ApiClient's default request headers).
// PUT/DELETE are idempotent server-side, so optimistic toggles can retry safely.
// Same contract as ios/Swapl/Core/Repositories/FavoritesRepository.swift.
@Singleton
class FavoritesRepository @Inject constructor(private val api: ApiClient) {

    suspend fun list(): FavoritesResponse =
        api.client.get("${api.baseUrl}/api/favorites").body()

    suspend fun ids(): FavoriteIdsResponse =
        api.client.get("${api.baseUrl}/api/favorites/ids").body()

    suspend fun add(listingId: String): FavoriteToggleResponse =
        api.client.put("${api.baseUrl}/api/favorites/$listingId").body()

    suspend fun remove(listingId: String): FavoriteToggleResponse =
        api.client.delete("${api.baseUrl}/api/favorites/$listingId").body()
}
