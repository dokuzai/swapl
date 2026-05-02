package app.swapl.core.repository

import app.swapl.core.model.InboxResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProposalRepository @Inject constructor(private val api: ApiClient) {
    suspend fun inbox(): InboxResponse =
        api.client.get("${api.baseUrl}/api/proposals").body()
}
