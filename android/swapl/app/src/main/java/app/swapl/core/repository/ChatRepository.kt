package app.swapl.core.repository

import app.swapl.core.model.ConversationsResponse
import app.swapl.core.model.SwapMessage
import app.swapl.core.model.SwapMessageCreateResponse
import app.swapl.core.model.SwapMessagesPage
import app.swapl.core.model.UploadResponse
import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

// Swap chat (DOK-154). The thread lives on the proposal and survives the
// transition into an agreement; only the two parties may read or post. GET
// implicitly marks inbound messages read (pass markRead=false to peek without
// clearing the badge — used by the lightweight foreground poll).
@Singleton
class ChatRepository @Inject constructor(private val api: ApiClient) {

    // Newest page (oldest-first within the page). Pass `before` (a message id)
    // to page further back into history.
    suspend fun messages(
        proposalId: String,
        before: String? = null,
        markRead: Boolean = true,
    ): SwapMessagesPage =
        api.client.get("${api.baseUrl}/api/proposals/$proposalId/messages") {
            before?.let { parameter("cursor", it) }
            if (!markRead) parameter("markRead", "false")
        }.body()

    suspend fun send(proposalId: String, body: String, photos: List<String>): SwapMessage =
        api.client.post("${api.baseUrl}/api/proposals/$proposalId/messages") {
            contentType(ContentType.Application.Json)
            setBody(SendBody(body = body, photos = photos.ifEmpty { null }))
        }.body<SwapMessageCreateResponse>().message

    // Explicit read receipt — clears the unread badge without re-fetching a page
    // (POST /api/proposals/[id]/messages/read). Best-effort; callers ignore the
    // result.
    suspend fun markRead(proposalId: String) {
        api.client.post("${api.baseUrl}/api/proposals/$proposalId/messages/read")
    }

    // The viewer's swap threads, most-recent-active first, with unread counts.
    // Drives the Messages-tab badge via totalUnread.
    suspend fun conversations(): ConversationsResponse =
        api.client.get("${api.baseUrl}/api/conversations").body()

    // Multipart photo upload, same endpoint listings use. Returns the photo URL
    // ready to attach to an outgoing message.
    suspend fun uploadPhoto(bytes: ByteArray, filename: String = "photo.jpg"): String =
        api.client.post("${api.baseUrl}/api/uploads/listing-photo") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            "file",
                            bytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, "image/jpeg")
                                append(HttpHeaders.ContentDisposition, "filename=\"$filename\"")
                            },
                        )
                    },
                ),
            )
        }.body<UploadResponse>().url

    @Serializable
    private data class SendBody(val body: String, val photos: List<String>? = null)
}
