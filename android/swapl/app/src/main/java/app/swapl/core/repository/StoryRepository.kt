package app.swapl.core.repository

import app.swapl.core.model.SwaplStory
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import javax.inject.Inject
import javax.inject.Singleton

// "Your Swapl story" networking (DOK-158). Thin relay over GET /api/me/story —
// the same endpoint the web/iOS clients use. All aggregation (timeline ordering,
// distinct city/country counts, the referral share block) lives server-side; the
// client only renders what it's handed.
@Singleton
class StoryRepository @Inject constructor(private val api: ApiClient) {

    // GET /api/me/story — the caller's travel/hosting timeline, headline counts,
    // and referral share block. Returns 401 when unauthenticated.
    suspend fun story(): SwaplStory =
        api.client.get("${api.baseUrl}/api/me/story").body()
}
