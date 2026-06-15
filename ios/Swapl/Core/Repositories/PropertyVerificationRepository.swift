import Foundation

// Optional owner-proof verification (DOK-162). Mirrors the
// /api/listings/{id}/property-verification GET (status) and POST (submit)
// endpoints. Approval earns the discreet "Verified owner" badge — it is NEVER a
// gate to publishing.

struct PropertyVerificationDocument: Codable, Sendable, Hashable {
    let url: String
    let label: String
}

// DOK-186: which kind of proof the host is uploading. The backend AI uses this
// as a hint when classifying the document, and it lets us tailor the copy.
enum PropertyDocumentType: String, CaseIterable, Sendable {
    case deed
    case lease
    case other

    var title: String {
        switch self {
        case .deed: return "Deed or title"
        case .lease: return "Lease agreement"
        case .other: return "Other proof"
        }
    }

    var subtitle: String {
        switch self {
        case .deed: return "You own this home (atto, visura)"
        case .lease: return "You rent this home (contratto di locazione)"
        case .other: return "Utility bill or similar in your name"
        }
    }

    var icon: String {
        switch self {
        case .deed: return "house.fill"
        case .lease: return "doc.text.fill"
        case .other: return "doc.fill"
        }
    }
}

struct PropertyVerification: Decodable, Sendable, Hashable {
    let id: String
    /// "pending" | "approved" | "rejected"
    let status: String
    let documents: [PropertyVerificationDocument]
    let note: String?
    let createdAt: String
    let updatedAt: String

    // DOK-186: AI document classification surfaced to the host. The eligibility
    // model rejects business/company-owned properties — Swapl is a swap between
    // private people. All optional so older servers (or no AI key) still decode.
    /// "private_owner" | "private_tenant" | "business" | "uncertain"
    let aiClassification: String?
    /// "deed" | "lease" | "other"
    let documentType: String?
    /// Set when the listing was marked ineligible, e.g. "business_property".
    let ineligibleReason: String?

    /// True when the rejection was because the home is a business/company property.
    var isBusinessRejection: Bool {
        aiClassification == "business" || ineligibleReason == "business_property"
    }
}

struct PropertyVerificationStatus: Decodable, Sendable {
    let ownerVerified: Bool
    let verification: PropertyVerification?
}

private struct PropertyVerificationSubmit: Encodable, Sendable {
    let documents: [PropertyVerificationDocument]
    let documentType: String?
}

final class PropertyVerificationRepository: @unchecked Sendable {
    static let shared = PropertyVerificationRepository()

    func status(listingId: String) async throws -> PropertyVerificationStatus {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/property-verification")
    }

    func submit(
        listingId: String,
        documents: [PropertyVerificationDocument],
        documentType: PropertyDocumentType? = nil
    ) async throws -> PropertyVerificationStatus {
        try await APIClient.shared.send(
            "POST", "/api/listings/\(listingId)/property-verification",
            body: PropertyVerificationSubmit(documents: documents, documentType: documentType?.rawValue)
        )
    }
}
