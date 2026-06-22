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
    var readAt: String? = nil
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
    var pendingChange: PendingDateChange? = nil
}

// Availability snapshot for the date-change picker + the booking's current
// dates to preselect (DOK-221 Phase 3).
struct DateChangeContext: Decodable, Sendable {
    let availability: ListingAvailability
    let currentFrom: String
    let currentTo: String
}

// An in-flight date-change request on the conversation (DOK-221 Phase 3).
struct PendingDateChange: Decodable, Hashable, Sendable {
    let from: String
    let to: String
    let requestedById: String
    let mine: Bool          // the viewer proposed it (→ show "waiting" + Withdraw)
    var at: String? = nil
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
    var archivedAt: String? = nil
    var proposalId: String? = nil
    var isPrincipal: Bool = true

    var isTraveling: Bool { role == "traveling" }
    var isArchived: Bool { archivedAt != nil }
}

struct UnifiedConversationsResponse: Decodable, Sendable {
    let conversations: [UnifiedConversation]
    let totalUnread: Int
}

// Role-aware header context for a thread (DOK-221): who's involved + a concrete
// reference to the underlying transaction. Host sees which apartment the guest
// chose + the Keys request; guest sees the home + request; both sides of a swap
// see both homes of the exchange.
struct ConversationContext: Decodable, Hashable, Sendable {
    struct Home: Decodable, Hashable, Sendable {
        let id: String
        let title: String
        let city: String?
        let photo: String?
    }
    struct Participant: Decodable, Hashable, Sendable, Identifiable {
        let id: String?
        let name: String?
        let avatar: String?
        let verified: Bool
        let role: String        // "host" | "guest"
        let isMe: Bool
        var isHost: Bool { role == "host" }
    }
    struct Keys: Decodable, Hashable, Sendable {
        let cost: Int
        let kind: String        // "keys" | "couchsurf"
    }

    let kind: String            // "swap" | "stay"
    let role: String            // "traveling" | "hosting"
    let status: String
    let dateFrom: String
    let dateTo: String
    let nights: Int
    let participants: [Participant]
    let home: Home?
    var myHome: Home? = nil
    var keys: Keys? = nil
    var proposalId: String? = nil
    let isPrincipal: Bool

    var isSwap: Bool { kind == "swap" }
    var isHosting: Bool { role == "hosting" }
}
