package app.swapl.core.repository

import app.swapl.core.model.AckReferrerNotificationsRequest
import app.swapl.core.model.AckReferrerNotificationsResponse
import app.swapl.core.model.InviteToStayRequest
import app.swapl.core.model.InviteToStayResponse
import app.swapl.core.model.ReferralDashboard
import app.swapl.core.model.ReferrerNotification
import app.swapl.core.model.ReferrerNotificationsResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

// Invite & earn networking (DOK-157). Thin relay over the same /api/referrals
// endpoints the web/iOS clients use. All growth economics (tiers, caps, waitlist
// position, the two-sided Keys reward) live server-side; this layer never
// computes them locally — it only reads the dashboard and issues invites.
@Singleton
class ReferralRepository @Inject constructor(private val api: ApiClient) {

    // GET /api/referrals — the caller's growth dashboard: shareable code + link,
    // who's joined, points earned, tier progress, waitlist position, leaderboard.
    suspend fun dashboard(): ReferralDashboard =
        api.client.get("${api.baseUrl}/api/referrals").body()

    // POST /api/referrals/invite-to-stay — issue an invite tied to one of the
    // caller's own listings. Returns a shareable link carrying an opaque token.
    suspend fun inviteToStay(listingId: String, email: String? = null): InviteToStayResponse =
        api.client.post("${api.baseUrl}/api/referrals/invite-to-stay") {
            contentType(ContentType.Application.Json)
            setBody(InviteToStayRequest(listingId = listingId, email = email))
        }.body()

    // GET /api/referrals/notifications — the caller's rewarded-but-unseen
    // referral credits, for the real-time referrer toast (DOK-157).
    suspend fun notifications(): List<ReferrerNotification> =
        api.client.get("${api.baseUrl}/api/referrals/notifications")
            .body<ReferrerNotificationsResponse>()
            .notifications

    // POST /api/referrals/notifications — ack credits already shown so each
    // toasts exactly once. Best-effort; the returned count is informational.
    suspend fun ackNotifications(ids: List<String>): Int =
        api.client.post("${api.baseUrl}/api/referrals/notifications") {
            contentType(ContentType.Application.Json)
            setBody(AckReferrerNotificationsRequest(ids = ids))
        }.body<AckReferrerNotificationsResponse>().seen
}
