import Foundation

// Dispute / resolution-center networking (DOK-153). Thin relay over the three
// server endpoints; all gating (only the two parties of an agreement) and the
// status machine live server-side. Photos are uploaded ahead of time through
// the shared /api/uploads/listing-photo pipeline (APIClient.uploadListingPhoto),
// so this layer only ever sends back the resulting URL strings.
final class DisputeRepository: @unchecked Sendable {
    static let shared = DisputeRepository()

    // GET /api/agreements/{id}/dispute — every dispute on the swap, newest first.
    func list(agreementId: String) async throws -> [Dispute] {
        let response: DisputeListResponse = try await APIClient.shared.send(
            "GET", "/api/agreements/\(agreementId)/dispute"
        )
        return response.disputes
    }

    // POST /api/agreements/{id}/dispute — open a case.
    struct OpenBody: Encodable, Sendable {
        let category: String
        let description: String
        let photos: [String]?
    }

    @discardableResult
    func open(
        agreementId: String,
        category: DisputeCategory,
        description: String,
        photos: [String]
    ) async throws -> OpenDisputeResponse {
        try await APIClient.shared.send(
            "POST", "/api/agreements/\(agreementId)/dispute",
            body: OpenBody(
                category: category.rawValue,
                description: description,
                photos: photos.isEmpty ? nil : photos
            )
        )
    }

    // POST /api/disputes/{id}/message — reply on an open case.
    struct MessageBody: Encodable, Sendable {
        let body: String
        let photos: [String]?
    }

    @discardableResult
    func reply(
        disputeId: String,
        body: String,
        photos: [String]
    ) async throws -> DisputeMessageResponse {
        try await APIClient.shared.send(
            "POST", "/api/disputes/\(disputeId)/message",
            body: MessageBody(body: body, photos: photos.isEmpty ? nil : photos)
        )
    }
}
