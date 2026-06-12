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
        /// Pay-on-accept (DOK-148): "none" | "card_saved" | … — informational.
        let paymentStatus: String?
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

    // MARK: - Editable items (DOK-148)

    struct ItemToggle: Encodable, Sendable {
        let itemId: String
        let selected: Bool
    }

    private struct ItemsRequest: Encodable, Sendable {
        let items: [ItemToggle]
    }

    struct PayableTotal: Decodable, Sendable {
        let totalCents: Int
        let currency: String
    }

    struct ItemsResponse: Decodable, Sendable {
        let ok: Bool
        /// Server truth for the payable subset after the toggle — the client
        /// applies it on top of its optimistic update.
        let payable: PayableTotal
    }

    /// Toggles experiences/services/add-ons of a DRAFT package on/off.
    /// Confirm, checkout and the eventual charge all read what's selected
    /// at their time, so this is the single edit point.
    func updateItems(packageId: String, toggles: [ItemToggle]) async throws -> ItemsResponse {
        try await APIClient.shared.send(
            "PATCH", "/api/assistant/inspire/\(packageId)/items",
            body: ItemsRequest(items: toggles)
        )
    }

    // MARK: - Pay-on-accept checkout (DOK-148)

    struct CheckoutLine: Decodable, Sendable, Identifiable {
        let id: String
        let slug: String
        let name: String
        let priceCents: Int
    }

    struct CheckoutSummary: Decodable, Sendable {
        let payableItems: [CheckoutLine]
        let totalCents: Int
        let currency: String
    }

    struct CheckoutResponse: Decodable, Sendable {
        /// false → no payable items or Stripe not configured server-side; the
        /// confirm proceeds without any payment step (env-gated degrade).
        let paymentRequired: Bool
        /// SetupIntent client secret — card saved off-session, NOTHING is
        /// charged until the host accepts the proposal.
        let clientSecret: String?
        let summary: CheckoutSummary
        let note: String?
    }

    /// Starts the pay-on-accept flow: a SetupIntent saves the card, the
    /// off-session PaymentIntent is created ONLY when the host accepts.
    func checkout(packageId: String) async throws -> CheckoutResponse {
        try await APIClient.shared.send(
            "POST", "/api/assistant/inspire/\(packageId)/checkout"
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
    /// "user" (explicit dates), "interpreted" (parsed from the prompt) or
    /// "availability" (from the user's listing).
    let source: String
}

// Every package item is individually toggleable via PATCH …/items (DOK-148):
// the server payload stores { id, selected } alongside the item fields.

struct InspireExperienceItem: Decodable, Sendable, Identifiable {
    let id: String
    var selected: Bool
    let city: String
    let country: String
    let title: String
    /// Partner slug, e.g. "getyourguide".
    let partner: String
    /// Click-through via /api/affiliate/{partner} — resolve via DiscoverRepository.resolveURL.
    let url: String
    let photo: DiscoverCityPhoto?

    var partnerDisplayName: String {
        switch partner {
        case "getyourguide": return "GetYourGuide"
        case "skyscanner": return "Skyscanner"
        case "airalo": return "Airalo"
        case "battleface": return "battleface"
        default: return partner.capitalized
        }
    }
}

struct InspireServiceItem: Decodable, Sendable, Identifiable {
    let id: String
    var selected: Bool
    let slug: String
    let name: String
    /// flights | esim | insurance
    let category: String
    /// Relative /api/affiliate/{slug}?… — resolve via DiscoverRepository.resolveURL.
    let url: String

    var symbolName: String {
        switch category {
        case "flights": return "airplane"
        case "esim": return "simcard"
        case "insurance": return "shield"
        default: return "sparkles"
        }
    }
}

/// A swapl concierge add-on offered inside the package — the ONLY payable
/// items (affiliate experiences/services stay external links, never charged
/// by us). Charged off-session only after the host accepts the proposal.
struct InspireAddOnItem: Decodable, Sendable, Identifiable {
    let id: String
    var selected: Bool
    let slug: String
    let name: String
    let description: String
    let priceCents: Int
    let currency: String
    let provider: String
    let category: String
}

/// What the assistant understood from the (possibly spoken) free-text prompt
/// — rendered as the "Understood: …" box, mirroring the web copy.
struct InspireInterpreted: Decodable, Sendable {
    let dateFrom: String?
    let dateTo: String?
    let city: String?
    /// "pet-friendly" | "wfh" | "step-free"
    let constraints: [String]?
    /// "ai" | "heuristic"
    let source: String
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
    let experiences: [InspireExperienceItem]
    let services: [InspireServiceItem]
    let addOns: [InspireAddOnItem]
    let interpreted: InspireInterpreted?
    let source: String

    /// Destination first, then the real alternatives — the hero pick can be
    /// swapped to any of these without another network call.
    var allCandidates: [InspireCandidate] { [destination] + alternatives }
}
