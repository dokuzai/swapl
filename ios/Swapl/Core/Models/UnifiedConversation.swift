import Foundation

// Unified per-transaction conversations (DOK-221). One thread hangs off a single
// swap OR stay; its timeline mixes member `text` messages with system `event`
// rows (request sent, confirmed, checked in, …), so the chat IS the activity log.

// One timeline item. `text` is a member message; `event` is a system row
// (authorId null) carrying an eventType + optional metadata.
struct UnifiedMessage: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let kind: String            // "text" | "event"
    let authorId: String?
    let mine: Bool
    let body: String?
    let photos: [String]
    let eventType: String?
    let eventMeta: EventMeta?
    let createdAt: String

    var isEvent: Bool { kind == "event" }

    // Only the fields our events actually carry; unknown keys are ignored.
    struct EventMeta: Decodable, Hashable, Sendable {
        var by: String? = nil
        var dateFrom: String? = nil
        var dateTo: String? = nil
        var guestCount: Int? = nil
    }
}

struct UnifiedTimelinePage: Decodable, Sendable {
    let messages: [UnifiedMessage]   // oldest-first within the page
    let nextCursor: String?
    let hasMore: Bool
}

// One row of the unified Messages list (a swap- or stay-backed thread).
struct UnifiedConversation: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let kind: String                 // "swap" | "stay"
    let role: String                 // "traveling" | "hosting"
    let status: String
    let title: String
    let city: String?
    let photo: String?
    let counterpartName: String?
    let dateFrom: String?
    let dateTo: String?
    let lastLine: String?
    let lastMessageAt: String
    let unreadCount: Int

    var isTraveling: Bool { role == "traveling" }
}

struct UnifiedConversationsResponse: Decodable, Sendable {
    let conversations: [UnifiedConversation]
    let totalUnread: Int
}
