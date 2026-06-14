import Foundation

// Dispute / resolution-center models (DOK-153). Mirror:
//   POST/GET app/app/api/agreements/[id]/dispute
//   POST     app/app/api/disputes/[id]/message
//
// The web layer (lib/disputes) owns the contract: the category vocabulary, the
// "urgent" set that foregrounds the 24/7 line (safety + access), and the status
// machine. The server stamps `urgent` and `status` on every payload, so the
// client never has to re-derive that policy — it just renders what it's told.

// MARK: - Category

// The fixed category vocabulary (lib/disputes DISPUTE_CATEGORIES). `urgent` is a
// client-side convenience for the picker copy; the SERVER is the source of
// truth for whether a given dispute is urgent (it stamps `dispute.urgent`).
enum DisputeCategory: String, CaseIterable, Identifiable, Sendable {
    case access
    case damage
    case cleanliness
    case safety
    case noShow = "no_show"
    case other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .access: return "Can't get in"
        case .damage: return "Damage"
        case .cleanliness: return "Cleanliness"
        case .safety: return "Safety concern"
        case .noShow: return "No-show"
        case .other: return "Something else"
        }
    }

    var subtitle: String {
        switch self {
        case .access: return "Locked out, wrong code, keys missing"
        case .damage: return "Something got broken or damaged"
        case .cleanliness: return "The home wasn't ready or clean"
        case .safety: return "You feel unsafe or something's wrong"
        case .noShow: return "Your swap partner didn't follow through"
        case .other: return "Anything else you need help with"
        }
    }

    var icon: String {
        switch self {
        case .access: return "key.fill"
        case .damage: return "hammer.fill"
        case .cleanliness: return "sparkles"
        case .safety: return "exclamationmark.shield.fill"
        case .noShow: return "person.fill.questionmark"
        case .other: return "ellipsis.bubble.fill"
        }
    }

    // Mirrors URGENT_CATEGORIES in lib/disputes — locked out / unsafe can't wait
    // on a queue, so the picker surfaces the 24/7 line straight away.
    var isUrgent: Bool { self == .access || self == .safety }
}

// MARK: - Status

enum DisputeStatus: String, Decodable, Sendable {
    case open
    case investigating
    case awaitingResponse = "awaiting_response"
    case resolved
    case closed

    // Unknown / future status strings degrade to `open` so an unexpected server
    // value never breaks decoding of the whole timeline.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DisputeStatus(rawValue: raw) ?? .open
    }

    var label: String {
        switch self {
        case .open: return "Open"
        case .investigating: return "We're on it"
        case .awaitingResponse: return "Your move"
        case .resolved: return "Resolved"
        case .closed: return "Closed"
        }
    }

    // Terminal states accept no new messages (TERMINAL_STATUSES on the server).
    var isTerminal: Bool { self == .resolved || self == .closed }
}

// MARK: - Dispute + messages

struct Dispute: Decodable, Identifiable, Sendable {
    let id: String
    let category: String
    let urgent: Bool
    let status: DisputeStatus
    let description: String
    let photos: [String]
    let resolution: String?
    let openedBy: Party
    let createdAt: String
    let updatedAt: String
    let messages: [DisputeMessage]

    struct Party: Decodable, Sendable {
        let id: String
        let name: String?
    }

    // Resolve the raw category string to the typed case for icon/title display,
    // tolerating any value the server might add later.
    var categoryKind: DisputeCategory { DisputeCategory(rawValue: category) ?? .other }
}

struct DisputeMessage: Decodable, Identifiable, Sendable {
    let id: String
    let authorId: String
    let authorName: String?
    let body: String
    let photos: [String]
    let createdAt: String
}

// MARK: - Responses

// GET /api/agreements/{id}/dispute — all disputes on the agreement, newest first.
struct DisputeListResponse: Decodable, Sendable {
    let disputes: [Dispute]
}

// POST /api/agreements/{id}/dispute — the freshly opened case (no messages yet).
struct OpenDisputeResponse: Decodable, Sendable {
    let ok: Bool
    let dispute: Opened

    struct Opened: Decodable, Sendable {
        let id: String
        let category: String
        let urgent: Bool
        let status: DisputeStatus
        let description: String
        let photos: [String]
        let createdAt: String
    }
}

// POST /api/disputes/{id}/message — the appended message + nudged status.
struct DisputeMessageResponse: Decodable, Sendable {
    let ok: Bool
    let status: DisputeStatus
    let message: DisputeMessage
}
