import Foundation

// GET /api/discover/services and /api/discover/experiences — the public,
// env-gated affiliate catalogue (DOK-145). Partners without an AFF_* id never
// appear, so an empty `items` array is a normal "nothing configured" answer.
// Affiliate URLs come back RELATIVE (/api/affiliate/{partner}?…) so every
// click is logged as an AffiliateClick before the 302 — resolve them against
// the API origin with `resolveURL` before opening.
final class DiscoverRepository: @unchecked Sendable {
    static let shared = DiscoverRepository()

    func services() async throws -> [DiscoverService] {
        let res: DiscoverServicesResponse = try await APIClient.shared.send("GET", "/api/discover/services")
        return res.items
    }

    func experiences(city: String? = nil) async throws -> [DiscoverExperience] {
        var query: [URLQueryItem] = []
        if let trimmed = city?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty {
            query.append(URLQueryItem(name: "city", value: trimmed))
        }
        let res: DiscoverExperiencesResponse = try await APIClient.shared.send(
            "GET", "/api/discover/experiences", query: query
        )
        return res.items
    }

    /// Resolves a possibly-relative affiliate href against the API origin so
    /// the click-through still hits the logging redirector.
    static func resolveURL(_ raw: String) -> URL? {
        if let url = URL(string: raw), url.scheme != nil { return url }
        return URL(string: raw, relativeTo: APIClient.shared.baseURL)?.absoluteURL
    }
}

// MARK: - Models (mirror lib/discover.ts)

struct DiscoverServicesResponse: Decodable, Sendable {
    let items: [DiscoverService]
}

struct DiscoverService: Decodable, Sendable, Identifiable {
    let slug: String
    let name: String
    /// flights | esim | experiences | insurance | concierge | …
    let category: String
    let tagline: String
    /// Click-through via /api/affiliate/{partner}; nil for concierge add-ons.
    let url: String?
    let iconHint: String
    /// Real catalogue price — only for concierge add-ons, never invented.
    let priceCents: Int?
    let currency: String?

    // Partner slugs and add-on slugs live in different namespaces server-side;
    // scope the id by category so an accidental collision can't break ForEach.
    var id: String { "\(category)|\(slug)" }

    var isConcierge: Bool { category == "concierge" }

    var formattedPrice: String? {
        guard let priceCents, priceCents > 0, let currency else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSNumber(value: Double(priceCents) / 100))
    }

    /// Maps the server's `iconHint` (a hint, never a URL) onto an SF Symbol.
    var symbolName: String {
        switch iconHint {
        case "plane": return "airplane"
        case "sim": return "simcard"
        case "ticket": return "ticket"
        case "shield": return "shield"
        case "sparkles": return "sparkles"
        case "key": return "key"
        case "car": return "car"
        case "map": return "map"
        case "concierge": return "bell"
        default: return "sparkles"
        }
    }
}

struct DiscoverExperiencesResponse: Decodable, Sendable {
    let items: [DiscoverExperience]
}

struct DiscoverExperience: Decodable, Sendable, Identifiable {
    let city: String
    let country: String
    let title: String
    /// Partner slug, e.g. "getyourguide".
    let partner: String
    /// Click-through via /api/affiliate/{partner} with the city query.
    let url: String
    /// Cached CityMedia photo; nil → client renders its city illustration.
    let photo: DiscoverCityPhoto?

    // The url embeds city + themed query, so it's unique per card.
    var id: String { url }

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

/// Subset of the CityPhoto shape (lib/city-media/types.ts) the app needs.
struct DiscoverCityPhoto: Decodable, Sendable {
    let url: String
    let width: Int
    let height: Int
    let alt: String
    let photographer: String?
    let sourceUrl: String?
    let provider: String
}
