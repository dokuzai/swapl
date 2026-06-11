package app.swapl.core.repository

import app.swapl.core.model.AdminMetrics
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MetricsRepository @Inject constructor(private val api: ApiClient) {

    suspend fun adminMetrics(): AdminMetrics =
        api.client.get("${api.baseUrl}/api/admin/metrics").body()
}
