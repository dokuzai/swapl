import Foundation

// Central deep-link vocabulary for the app. Parsed from:
//   - the custom scheme:      swapl://listing/:id, swapl://proposal/:id
//     (plus the plural/legacy hosts the backend emits in push payloads:
//     swapl://listings/:id, swapl://swaps/:id — see app/lib/push/index.ts)
//   - universal links:        https://app.swapl.fun/listings/:id,
//                             https://app.swapl.fun/swaps/:id
// RootView turns a destination into navigation; PushService and onOpenURL
// only ever hand over URLs.
enum DeepLinkDestination: Identifiable, Equatable {
    case listing(id: String)
    case proposal(id: String)

    var id: String {
        switch self {
        case .listing(let id): "listing-\(id)"
        case .proposal(let id): "proposal-\(id)"
        }
    }

    static func parse(_ url: URL) -> DeepLinkDestination? {
        // Normalize both URL shapes into ["listing", "<id>"]-style segments.
        // For swapl://listing/abc the kind lands in `host`, not the path.
        let segments: [String]
        switch url.scheme?.lowercased() {
        case "swapl":
            let host = url.host().map { [$0] } ?? []
            segments = host + url.pathComponents.filter { $0 != "/" }
        case "https", "http":
            guard url.host()?.lowercased() == "app.swapl.fun" else { return nil }
            segments = url.pathComponents.filter { $0 != "/" }
        default:
            return nil
        }

        guard segments.count >= 2, !segments[1].isEmpty else { return nil }
        let id = segments[1]
        switch segments[0].lowercased() {
        case "listing", "listings":
            return .listing(id: id)
        case "proposal", "proposals", "swap", "swaps":
            return .proposal(id: id)
        default:
            return nil
        }
    }
}
