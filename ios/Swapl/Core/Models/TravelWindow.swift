import Foundation

// Saved travel windows (DOK-161): a member's "I want to travel around these
// dates" intents. The AI turns each into ready-made swap proposals — real,
// available, date-compatible homes — and the digest cron watches for new
// compatible homes. Mirrors the DTO from app/app/api/travel-windows/route.ts.
struct TravelWindow: Decodable, Sendable, Identifiable {
    let id: String
    let dateFrom: String   // yyyy-MM-dd
    let dateTo: String
    let flexible: Bool
    let destinations: [String]
    let notes: String?
    /// ISO string — kept raw; format via SwaplDateText.
    let createdAt: String

    /// Localized "MMM d – MMM d, yyyy" label for the window's span.
    var rangeLabel: String { SwaplDateText.range(from: dateFrom, to: dateTo) }
}

// One AI-composed proposal for a window: a real, active, date-compatible home
// ranked by match score + travel profile, annotated with the swap modes it
// supports. Mirrors WindowProposal in app/lib/ai/window-proposals.ts.
struct WindowProposal: Decodable, Sendable, Identifiable {
    let listingId: String
    let title: String
    let city: String
    let country: String
    let photo: String?
    let matchScore: Int
    let modes: Modes
    let nightlyKeys: Int?
    /// Short, data-grounded reason this home fits the window.
    let why: String
    /// True when the home also sits in one of the window's preferred destinations.
    let matchesDestination: Bool

    var id: String { listingId }

    struct Modes: Decodable, Sendable {
        /// Direct home-for-home swap — always available for a real, free home.
        let directSwap: Bool
        /// Stay-with-Keys — only when the host listed a per-night Keys value.
        let keysStay: Bool
    }

    var locationText: String { country.isEmpty ? city : "\(city), \(country)" }
}

struct WindowProposalsResult: Decodable, Sendable {
    let windowId: String
    let dates: Dates
    let destinations: [String]
    let proposals: [WindowProposal]

    struct Dates: Decodable, Sendable {
        let from: String
        let to: String
        let flexible: Bool
    }
}
