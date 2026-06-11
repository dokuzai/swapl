package app.swapl.core.repository

import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import javax.inject.Inject
import javax.inject.Singleton

// Didit identity verification (hosted flow), mirroring the iOS repository.
//
// The backend is env-gated: with Didit unconfigured, /status still answers
// (enabled=false → the client hides the CTA) while /session returns 503.

// GET /api/verification/status
@kotlinx.serialization.Serializable
data class VerificationStatus(
    val enabled: Boolean = false,
    /** "none" | "pending" | "approved" | "declined" | ... */
    val status: String = "none",
    val verified: Boolean = false,
    val verifiedAt: String? = null,
    val completedAt: String? = null,
)

// POST /api/verification/session — `url` is the hosted Didit page (null once
// already approved).
@kotlinx.serialization.Serializable
data class VerificationSessionStart(
    val status: String,
    val url: String? = null,
)

@Singleton
class VerificationRepository @Inject constructor(private val api: ApiClient) {

    suspend fun status(): VerificationStatus =
        api.client.get("${api.baseUrl}/api/verification/status").body()

    suspend fun createSession(): VerificationSessionStart =
        api.client.post("${api.baseUrl}/api/verification/session").body()
}
