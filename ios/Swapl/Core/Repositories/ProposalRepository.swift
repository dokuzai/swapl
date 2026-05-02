import Foundation

final class ProposalRepository: @unchecked Sendable {
    static let shared = ProposalRepository()

    func inbox() async throws -> InboxResponse {
        try await APIClient.shared.send("GET", "/api/proposals")
    }

    func detail(id: String) async throws -> ProposalDetail {
        try await APIClient.shared.send("GET", "/api/proposals/\(id)")
    }
}
