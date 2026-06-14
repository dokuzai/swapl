import Foundation

// Swap chat (DOK-154). The thread lives on the proposal and survives the
// transition into an agreement; only the two parties may read or post. GET
// implicitly marks inbound messages read (pass markRead:false to peek without
// clearing the badge — used by the lightweight foreground poll).
final class ChatRepository: @unchecked Sendable {
    static let shared = ChatRepository()

    // Newest page (oldest-first within the page). Pass `before` (a message id)
    // to page further back into history.
    func messages(proposalId: String, before cursor: String? = nil, markRead: Bool = true) async throws -> SwapMessagesPage {
        var query: [URLQueryItem] = []
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        if !markRead { query.append(URLQueryItem(name: "markRead", value: "false")) }
        return try await APIClient.shared.send("GET", "/api/proposals/\(proposalId)/messages", query: query)
    }

    struct SendBody: Encodable {
        let body: String
        let photos: [String]?
    }

    func send(proposalId: String, body: String, photos: [String]) async throws -> SwapMessage {
        let payload = SendBody(body: body, photos: photos.isEmpty ? nil : photos)
        let response: SwapMessageCreateResponse = try await APIClient.shared.send(
            "POST", "/api/proposals/\(proposalId)/messages", body: payload
        )
        return response.message
    }

    func conversations() async throws -> ConversationsResponse {
        try await APIClient.shared.send("GET", "/api/conversations")
    }
}
