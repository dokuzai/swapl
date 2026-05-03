import Foundation

final class ProposalRepository: @unchecked Sendable {
    static let shared = ProposalRepository()

    func inbox() async throws -> InboxResponse {
        try await APIClient.shared.send("GET", "/api/proposals")
    }

    func detail(id: String) async throws -> ProposalDetail {
        try await APIClient.shared.send("GET", "/api/proposals/\(id)")
    }

    func create(_ draft: ProposalDraft) async throws -> ProposalCreateResponse {
        try await APIClient.shared.send("POST", "/api/proposals", body: draft)
    }
}

struct ProposalDraft: Encodable, Sendable {
    let proposerListingId: String
    let targetListingId: String
    let dateFrom: String
    let dateTo: String
    let message: String?
}

struct ProposalCreateResponse: Decodable, Sendable {
    let ok: Bool?
    let id: String
}
