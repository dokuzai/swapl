import Foundation

// AI assistant backend (DOK-146), bearer-authed via APIClient:
//   - the transparent travel profile (built ONLY from in-app signals; the
//     user can read it verbatim, refresh it, and delete it),
//   - the "Get Inspired" package flow: compose a draft from REAL active
//     listings, then confirm (creates an actual proposal through the same
//     code path as POST /api/proposals — plan limits & suspension apply)
//     or dismiss.
// Degrades server-side without an AI key (deterministic composition), so
// every endpoint always answers with the same shapes.
final class AssistantRepository: @unchecked Sendable {
    static let shared = AssistantRepository()

    // MARK: - Travel profile

    func profile() async throws -> TravelProfile {
        try await APIClient.shared.send("GET", "/api/assistant/profile")
    }

    /// Rebuild from the latest in-app signals. 429 after 5/hour.
    func refreshProfile() async throws -> TravelProfile {
        try await APIClient.shared.send("POST", "/api/assistant/profile/refresh")
    }

    /// Transparency: erases the synthesised profile entirely.
    func deleteProfile() async throws {
        let _: EmptyResponse = try await APIClient.shared.send("DELETE", "/api/assistant/profile")
    }

    // MARK: - Get Inspired

    private struct InspireRequest: Encodable, Sendable {
        let prompt: String?
        let dateFrom: String?   // yyyy-MM-dd
        let dateTo: String?
    }

    /// Composes a draft package. Throws APIError.status(422, _) with codes
    /// NO_ACTIVE_LISTING / NO_CANDIDATES; 429 after 10/hour.
    func inspire(prompt: String?, dateFrom: String?, dateTo: String?) async throws -> InspirePackage {
        try await APIClient.shared.send(
            "POST", "/api/assistant/inspire",
            body: InspireRequest(prompt: prompt, dateFrom: dateFrom, dateTo: dateTo)
        )
    }

    private struct ConfirmRequest: Encodable, Sendable {
        let listingId: String?  // must be the destination or one of the alternatives
        let dateFrom: String?
        let dateTo: String?
        let message: String?
    }

    struct ConfirmResponse: Decodable, Sendable {
        let ok: Bool
        let proposalId: String
        let packageId: String
    }

    /// Turns the draft into a REAL proposal (same path as POST /api/proposals,
    /// so 402 plan-limit upsells and suspension refusals propagate verbatim).
    func confirm(
        packageId: String,
        listingId: String?,
        dateFrom: String?,
        dateTo: String?,
        message: String?
    ) async throws -> ConfirmResponse {
        try await APIClient.shared.send(
            "POST", "/api/assistant/inspire/\(packageId)/confirm",
            body: ConfirmRequest(listingId: listingId, dateFrom: dateFrom, dateTo: dateTo, message: message)
        )
    }

    func dismiss(packageId: String) async throws {
        let _: EmptyResponse = try await APIClient.shared.send(
            "POST", "/api/assistant/inspire/\(packageId)/dismiss"
        )
    }
}

// MARK: - Models (mirror lib/ai/travel-profile.ts and lib/ai/inspire.ts)

struct TravelTraits: Decodable, Sendable {
    let themes: [String]
    let cities: [String]
    let vibe: String?
    let constraints: [String]
}

struct TravelProfile: Decodable, Sendable {
    let summary: String
    let traits: TravelTraits
    /// e.g. ["interests", "favorites", "saved_searches", "swap_messages"].
    let sourcesUsed: [String]
    /// ISO string with fractional seconds — kept raw; format via SwaplDateText.
    let updatedAt: String
}

struct InspireCandidate: Decodable, Sendable, Identifiable {
    let listingId: String
    let city: String
    let country: String
    let title: String
    let photo: String?
    let matchScore: Int
    /// Present only on the package destination ("why this fits you").
    let why: String?

    var id: String { listingId }
}

struct InspireDates: Decodable, Sendable {
    let from: String   // yyyy-MM-dd
    let to: String
    /// "user" (explicit dates) or "availability" (from the user's listing).
    let source: String
}

struct InspireService: Decodable, Sendable, Identifiable {
    let slug: String
    let name: String
    /// flights | esim | insurance
    let category: String
    /// Relative /api/affiliate/{slug}?… — resolve via DiscoverRepository.resolveURL.
    let url: String

    var id: String { slug }

    var symbolName: String {
        switch category {
        case "flights": return "airplane"
        case "esim": return "simcard"
        case "insurance": return "shield"
        default: return "sparkles"
        }
    }
}

struct InspirePackage: Decodable, Sendable {
    let packageId: String
    let myListingId: String
    let destination: InspireCandidate
    let alternatives: [InspireCandidate]
    let dates: InspireDates
    let proposalMessage: String
    /// "ai" | "fallback" — whether the draft came from the LLM or the template.
    let proposalMessageSource: String
    let experiences: [DiscoverExperience]
    let services: [InspireService]
    let source: String

    /// Destination first, then the real alternatives — the hero pick can be
    /// swapped to any of these without another network call.
    var allCandidates: [InspireCandidate] { [destination] + alternatives }
}
