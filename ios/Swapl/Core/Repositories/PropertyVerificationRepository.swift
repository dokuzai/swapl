import Foundation

// Optional owner-proof verification (DOK-162). Mirrors the
// /api/listings/{id}/property-verification GET (status) and POST (submit)
// endpoints. Approval earns the discreet "Verified owner" badge — it is NEVER a
// gate to publishing.

struct PropertyVerificationDocument: Codable, Sendable, Hashable {
    let url: String
    let label: String
}

struct PropertyVerification: Decodable, Sendable, Hashable {
    let id: String
    /// "pending" | "approved" | "rejected"
    let status: String
    let documents: [PropertyVerificationDocument]
    let note: String?
    let createdAt: String
    let updatedAt: String
}

struct PropertyVerificationStatus: Decodable, Sendable {
    let ownerVerified: Bool
    let verification: PropertyVerification?
}

private struct PropertyVerificationSubmit: Encodable, Sendable {
    let documents: [PropertyVerificationDocument]
}

final class PropertyVerificationRepository: @unchecked Sendable {
    static let shared = PropertyVerificationRepository()

    func status(listingId: String) async throws -> PropertyVerificationStatus {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/property-verification")
    }

    func submit(listingId: String, documents: [PropertyVerificationDocument]) async throws -> PropertyVerificationStatus {
        try await APIClient.shared.send(
            "POST", "/api/listings/\(listingId)/property-verification",
            body: PropertyVerificationSubmit(documents: documents)
        )
    }
}
