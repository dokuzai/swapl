package app.swapl.core.repository

import app.swapl.core.model.SupportContacts
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import javax.inject.Inject
import javax.inject.Singleton

// GET /api/config/support-contacts — public support config (24/7 phone line +
// help-centre URL) sourced from env on the server, with launch defaults. The
// dispute flow reads these so the "Report a problem" surfaces stay in sync with
// web and iOS without an app release.
@Singleton
class SupportContactsRepository @Inject constructor(private val api: ApiClient) {
    suspend fun fetch(): SupportContacts =
        api.client.get("${api.baseUrl}/api/config/support-contacts").body()
}
