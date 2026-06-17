import Foundation

// Backend AI drafting — POST /api/ai/proposal-message (bearer-authed).
// The server gathers both listings + the proposer's profile itself, drafts
// with the configured LLM, and falls back to a deterministic template when
// no provider key is set — either way a 200 with a real message.
// 429 (20 req / 10 min per user) surfaces as APIClient.APIError.status(429, _).
final class AIDraftRepository: @unchecked Sendable {
    static let shared = AIDraftRepository()

    // POST /api/ai/listing-content — draft a listing title + description from the
    // form facts and (when a vision model is set) the uploaded photos.
    struct ListingContentRequest: Encodable, Sendable {
        let city: String
        let neighbourhood: String
        let country: String?
        let propertyType: String
        let sizeSqm: Int
        let sleeps: Int
        let bedrooms: Int
        let bathrooms: Int
        let floor: Int?
        let hasElevator: Bool?
        let stepFreeAccess: Bool?
        let petsAllowed: Bool?
        let wfhSetup: Bool?
        let amenities: [String]?
        let hostNotes: String?
        let photoUrls: [String]?
    }

    struct ListingContentResponse: Decodable, Sendable {
        let title: String
        let description: String
        let source: String?
    }

    func listingContent(_ body: ListingContentRequest) async throws -> ListingContentResponse {
        try await APIClient.shared.send("POST", "/api/ai/listing-content", body: body)
    }

    struct ProposalMessageRequest: Encodable, Sendable {
        let proposerListingId: String
        let targetListingId: String
        let dateFrom: String?   // yyyy-MM-dd
        let dateTo: String?     // yyyy-MM-dd
        let hostNotes: String?
    }

    struct ProposalMessageResponse: Decodable, Sendable {
        let message: String
        let source: String?
    }

    func proposalMessage(
        proposerListingId: String,
        targetListingId: String,
        dateFrom: String? = nil,
        dateTo: String? = nil,
        hostNotes: String? = nil
    ) async throws -> ProposalMessageResponse {
        try await APIClient.shared.send(
            "POST",
            "/api/ai/proposal-message",
            body: ProposalMessageRequest(
                proposerListingId: proposerListingId,
                targetListingId: targetListingId,
                dateFrom: dateFrom,
                dateTo: dateTo,
                hostNotes: hostNotes
            )
        )
    }
}
