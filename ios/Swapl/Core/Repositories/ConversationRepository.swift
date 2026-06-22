import Foundation

// Unified conversation API (DOK-221), keyed by conversationId so it serves both
// swap- and stay-backed threads. Mirrors ChatRepository's shape but talks to the
// new /api/conversations/{id}/* endpoints and the v2 unified list.
final class ConversationRepository: @unchecked Sendable {
    static let shared = ConversationRepository()

    // GET /api/conversations?v=2 — the unified Messages list (swap + stay).
    func list() async throws -> UnifiedConversationsResponse {
        try await APIClient.shared.send("GET", "/api/conversations", query: [URLQueryItem(name: "v", value: "2")])
    }

    // GET /api/conversations/{id}/messages — timeline (messages + events),
    // oldest-first within a page; page backwards with `before`.
    func timeline(conversationId: String, before cursor: String? = nil, markRead: Bool = true) async throws -> UnifiedTimelinePage {
        var query: [URLQueryItem] = []
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        if !markRead { query.append(URLQueryItem(name: "markRead", value: "false")) }
        return try await APIClient.shared.send("GET", "/api/conversations/\(conversationId)/messages", query: query)
    }

    // POST /api/conversations/{id}/messages — echoes back the created message.
    struct SendBody: Encodable { let body: String?; let photos: [String]? }
    func send(conversationId: String, body: String, photos: [String]) async throws -> UnifiedMessage {
        let payload = SendBody(body: body.isEmpty ? nil : body, photos: photos.isEmpty ? nil : photos)
        return try await APIClient.shared.send("POST", "/api/conversations/\(conversationId)/messages", body: payload)
    }

    // POST /api/conversations/{id}/read — clear the caller's unread cursor.
    func markRead(conversationId: String) async throws {
        let _: EmptyResponse = try await APIClient.shared.send("POST", "/api/conversations/\(conversationId)/read")
    }

    // POST /api/conversations/{id}/archive — per-user archive toggle.
    struct ArchiveBody: Encodable { let archived: Bool }
    func setArchived(conversationId: String, archived: Bool) async throws {
        let _: EmptyResponse = try await APIClient.shared.send(
            "POST", "/api/conversations/\(conversationId)/archive", body: ArchiveBody(archived: archived)
        )
    }

    // GET /api/conversations/{id}/change-context — availability for the picker.
    func changeContext(conversationId: String) async throws -> DateChangeContext {
        try await APIClient.shared.send("GET", "/api/conversations/\(conversationId)/change-context")
    }

    // POST /api/conversations/{id}/change-request — propose new dates (DOK-221 Phase 3).
    struct ChangeRequestBody: Encodable { let dateFrom: String; let dateTo: String }
    func requestDateChange(conversationId: String, dateFrom: String, dateTo: String) async throws {
        let _: EmptyResponse = try await APIClient.shared.send(
            "POST", "/api/conversations/\(conversationId)/change-request",
            body: ChangeRequestBody(dateFrom: dateFrom, dateTo: dateTo)
        )
    }

    // POST /api/conversations/{id}/change-response — accept/decline the pending change.
    struct ChangeResponseBody: Encodable { let accept: Bool }
    func respondDateChange(conversationId: String, accept: Bool) async throws {
        let _: EmptyResponse = try await APIClient.shared.send(
            "POST", "/api/conversations/\(conversationId)/change-response",
            body: ChangeResponseBody(accept: accept)
        )
    }
}
