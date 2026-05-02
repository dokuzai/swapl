import Foundation

struct ProposalSummary: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let status: String
    let meSide: String
    let dateFrom: String
    let dateTo: String
    let message: String?
    let myCity: String
    let myNeighbourhood: String
    let theirCity: String
    let theirNeighbourhood: String
    let otherName: String?
    let updatedAt: String
}

struct InboxResponse: Decodable, Sendable {
    let buckets: Buckets
    struct Buckets: Decodable, Sendable {
        let waitingOnYou: [ProposalSummary]
        let sent: [ProposalSummary]
        let active: [ProposalSummary]
        let archived: [ProposalSummary]
    }
}

struct ProposalDetail: Decodable, Sendable {
    let proposal: Proposal
    let proposerListing: Listing
    let targetListing: Listing
    let other: Other
    let agreement: Agreement?

    struct Proposal: Codable, Sendable {
        let id: String
        let status: String
        let meSide: String
        let dateFrom: String
        let dateTo: String
        let message: String?
        let counterDateFrom: String?
        let counterDateTo: String?
        let counterMessage: String?
        let createdAt: String
        let updatedAt: String
    }
    struct Other: Codable, Sendable {
        let id: String
        let name: String?
        let avatar: String?
        let verified: Bool
    }
    struct Agreement: Codable, Sendable {
        let id: String
        let dateFrom: String
        let dateTo: String
        let keyCode1: String?
        let keyCode2: String?
        let status: String
        let insurance: Insurance?

        struct Insurance: Codable, Sendable {
            let policyNumber: String
            let coverageAmount: Int
            let status: String
            let expiresAt: String
        }
    }
}
