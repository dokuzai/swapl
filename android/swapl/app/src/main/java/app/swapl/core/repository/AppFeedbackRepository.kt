package app.swapl.core.repository

import app.swapl.core.network.ApiClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

// Structured in-app feedback (rate-the-app, M1). Shared backend model
// AppFeedback / POST /api/app-feedback serves web, iOS and Android — only the
// `source` tag differs per platform.
@Singleton
class AppFeedbackRepository @Inject constructor(private val api: ApiClient) {
    suspend fun submit(
        score: Int,
        comment: String?,
        surface: String,
        contextKey: String,
    ) {
        api.client.post("${api.baseUrl}/api/app-feedback") {
            contentType(ContentType.Application.Json)
            setBody(
                FeedbackBody(
                    score = score,
                    comment = comment,
                    source = "android",
                    surface = surface,
                    contextKey = contextKey,
                ),
            )
        }
    }

    @Serializable
    private data class FeedbackBody(
        val score: Int,
        val comment: String? = null,
        val source: String,
        val surface: String,
        val contextKey: String,
    )
}
