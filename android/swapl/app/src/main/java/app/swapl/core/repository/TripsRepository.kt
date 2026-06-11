package app.swapl.core.repository

import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalDetail
import app.swapl.core.model.ProposalSummary
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import javax.inject.Inject
import javax.inject.Singleton

// Trips are accepted swaps. The backend has no standalone agreements list
// endpoint — web (/swaps) and iOS both read agreements through the proposals
// API: the inbox "active" bucket is the ACCEPTED list, and the proposal detail
// embeds the agreement (key codes + insurance) for participants. We do the same.
@Singleton
class TripsRepository @Inject constructor(private val api: ApiClient) {
    suspend fun trips(): List<ProposalSummary> =
        api.client.get("${api.baseUrl}/api/proposals")
            .body<InboxResponse>().buckets.active

    suspend fun detail(proposalId: String): ProposalDetail =
        api.client.get("${api.baseUrl}/api/proposals/$proposalId").body()
}
