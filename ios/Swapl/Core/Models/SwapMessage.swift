import Foundation

// A single chat message in a swap thread (DOK-154). Mirrors the serialized
// shape from app/app/api/proposals/[id]/messages/route.ts: `mine` is computed
// server-side from the session, `readAt` is the read-receipt timestamp.
struct SwapMessage: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let proposalId: String
    let authorId: String
    let mine: Bool
    let body: String
    let photos: [String]
    let readAt: String?
    let createdAt: String
}

// GET /api/proposals/[id]/messages — oldest-first page with a backwards cursor.
struct SwapMessagesPage: Decodable, Sendable {
    let messages: [SwapMessage]
    let nextCursor: String?
    let hasMore: Bool
}

// POST /api/proposals/[id]/messages — server echoes the created message back.
struct SwapMessageCreateResponse: Decodable, Sendable {
    let message: SwapMessage
}

// One row of GET /api/conversations — the mobile chat list. Mirrors the
// Conversation type in app/app/swaps/conversations.ts.
struct Conversation: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let status: String
    let dateFrom: String
    let dateTo: String
    let updatedAt: String
    let role: String // "hosting" | "traveling"
    let myCity: String
    let myNeighbourhood: String
    let theirCity: String
    let theirNeighbourhood: String
    let otherName: String?
    let lastLine: String?
    let lastMessageAt: String?
    let unreadCount: Int
}

struct ConversationsResponse: Decodable, Sendable {
    let conversations: [Conversation]
    let totalUnread: Int
}
