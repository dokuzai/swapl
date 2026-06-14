package app.swapl.core.model

import kotlinx.serialization.Serializable

// First-class swap chat (DOK-154). Mirrors the serialized shape from
// app/app/api/proposals/[id]/messages/route.ts: `mine` is computed server-side
// from the session, `readAt` is the read-receipt timestamp. The thread is bound
// to the proposal and keeps flowing after it becomes an agreement.
@Serializable
data class SwapMessage(
    val id: String,
    val proposalId: String,
    val authorId: String,
    val mine: Boolean,
    val body: String,
    val photos: List<String> = emptyList(),
    val readAt: String? = null,
    val createdAt: String,
)

// GET /api/proposals/[id]/messages — oldest-first page with a backwards cursor.
@Serializable
data class SwapMessagesPage(
    val messages: List<SwapMessage>,
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
)

// POST /api/proposals/[id]/messages — server echoes the created message back.
@Serializable
data class SwapMessageCreateResponse(val message: SwapMessage)

// One row of GET /api/conversations — the mobile chat list. Mirrors the
// Conversation type in app/app/swaps/conversations.ts.
@Serializable
data class Conversation(
    val id: String,
    val status: String,
    val dateFrom: String,
    val dateTo: String,
    val updatedAt: String,
    val role: String, // "hosting" | "traveling"
    val myCity: String,
    val myNeighbourhood: String,
    val theirCity: String,
    val theirNeighbourhood: String,
    val otherName: String? = null,
    val lastLine: String? = null,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
)

// GET /api/conversations — drives the mobile chat list and the Messages-tab
// unread badge (totalUnread = sum of inbound unread across threads).
@Serializable
data class ConversationsResponse(
    val conversations: List<Conversation> = emptyList(),
    val totalUnread: Int = 0,
)
