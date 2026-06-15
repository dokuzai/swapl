import Foundation

// Conversation participants (DOK-187). Anyone with thread access (principals +
// active guests) can read the roster; only principals may invite, fetch
// suggestions, or remove a guest. The two principals are derived server-side,
// so the client never sends them — it only adds/removes co-travelers.
final class ParticipantRepository: @unchecked Sendable {
    static let shared = ParticipantRepository()

    func participants(proposalId: String) async throws -> [ConversationParticipant] {
        let response: ParticipantsResponse = try await APIClient.shared.send(
            "GET", "/api/proposals/\(proposalId)/participants"
        )
        return response.participants
    }

    func suggestions(proposalId: String) async throws -> [ParticipantSuggestion] {
        let response: ParticipantSuggestionsResponse = try await APIClient.shared.send(
            "GET", "/api/proposals/\(proposalId)/participants/suggestions"
        )
        return response.suggestions
    }

    // Exactly one of byUserId / byEmail is sent. Server upserts (idempotent):
    // a known account becomes an active seat immediately; an unknown email
    // becomes a pending invite. Returns the full refreshed roster.
    private struct InviteBody: Encodable {
        let byUserId: String?
        let byEmail: String?
    }

    // We don't depend on the 201 body's shape — the caller reloads the roster
    // afterwards, so a thin EmptyResponse decode keeps this robust.
    func invite(proposalId: String, byUserId: String) async throws {
        let body = InviteBody(byUserId: byUserId, byEmail: nil)
        _ = try await APIClient.shared.send(
            "POST", "/api/proposals/\(proposalId)/participants", body: body,
            as: EmptyResponse.self
        )
    }

    func invite(proposalId: String, byEmail: String) async throws {
        let body = InviteBody(byUserId: nil, byEmail: byEmail)
        _ = try await APIClient.shared.send(
            "POST", "/api/proposals/\(proposalId)/participants", body: body,
            as: EmptyResponse.self
        )
    }

    func remove(proposalId: String, participantId: String) async throws {
        _ = try await APIClient.shared.send(
            "DELETE", "/api/proposals/\(proposalId)/participants/\(participantId)",
            as: EmptyResponse.self
        )
    }
}
