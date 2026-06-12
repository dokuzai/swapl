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

    // ---------- mutations on an existing proposal ----------

    struct ActionResponse: Decodable, Sendable {
        let ok: Bool
        let agreementId: String?
    }

    // Discriminated union mirroring app/app/api/proposals/[id]/route.ts.
    enum Action: Encodable {
        case accept
        case decline
        case withdraw
        case counter(dateFrom: String, dateTo: String, message: String?)

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .accept:   try c.encode("accept", forKey: .action)
            case .decline:  try c.encode("decline", forKey: .action)
            case .withdraw: try c.encode("withdraw", forKey: .action)
            case let .counter(from, to, message):
                try c.encode("counter", forKey: .action)
                try c.encode(from, forKey: .counterDateFrom)
                try c.encode(to, forKey: .counterDateTo)
                try c.encodeIfPresent(message, forKey: .counterMessage)
            }
        }
        enum CodingKeys: String, CodingKey {
            case action, counterDateFrom, counterDateTo, counterMessage
        }
    }

    func act(proposalId: String, _ action: Action) async throws -> ActionResponse {
        try await APIClient.shared.send("POST", "/api/proposals/\(proposalId)", body: action)
    }

    // POST /api/agreements/{id}/review — one review per author per COMPLETED
    // agreement (DOK-147). Server validates rating 1-5 and text 20-1000 chars.
    struct ReviewBody: Encodable {
        let rating: Int
        let text: String
    }

    func submitReview(agreementId: String, rating: Int, text: String) async throws {
        _ = try await APIClient.shared.send(
            "POST", "/api/agreements/\(agreementId)/review",
            body: ReviewBody(rating: rating, text: text),
            as: EmptyResponse.self
        )
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
