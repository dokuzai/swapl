import Foundation

// Roster of a swap conversation (DOK-187). The two principals (proposer +
// target-listing owner) are materialized implicitly server-side and returned
// with synthetic ids "principal:<userId>"; only invited co-travelers
// ("guest_participant") are stored as real rows. A guest can be active
// (already on the thread) or pending (invited by email, not yet joined).
struct ConversationParticipant: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let userId: String?
    let invitedEmail: String?
    let name: String?
    let avatar: String?
    let role: String   // "principal" | "guest_participant"
    let status: String // "active" | "pending" | "removed"

    var isPrincipal: Bool { role == "principal" }
    var isGuest: Bool { role == "guest_participant" }
    var isPending: Bool { status == "pending" }
    var isActive: Bool { status == "active" }

    // Best label we can show: name, else the invited email, else a fallback.
    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let invitedEmail, !invitedEmail.isEmpty { return invitedEmail }
        return "Guest"
    }

    var initial: String {
        String(displayName.prefix(1)).uppercased()
    }
}

struct ParticipantsResponse: Decodable, Sendable {
    let participants: [ConversationParticipant]
}

// One-tap "Add co-travelers" quick-pick: accounts the caller has already
// swapped with, safe to surface as immediate invites.
struct ParticipantSuggestion: Identifiable, Decodable, Hashable, Sendable {
    let id: String        // the candidate's userId
    let name: String?
    let avatar: String?

    var displayName: String { (name?.isEmpty == false ? name! : "Member") }
    var initial: String { String(displayName.prefix(1)).uppercased() }
}

struct ParticipantSuggestionsResponse: Decodable, Sendable {
    let suggestions: [ParticipantSuggestion]
}
