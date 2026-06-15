import Foundation

// Travel windows backend (DOK-161), bearer-authed via APIClient.
//   - list/create/delete a member's saved "I want to travel around these
//     dates" intents (create is tier-capped: Free=3, Plus=10, Pro=unlimited;
//     over the cap the POST returns 402 { error, upgradeTo, currentPlan }),
//   - GET …/{id}/proposals: the AI's ready-made swap proposals for the window
//     (real, available, date-compatible homes ranked by match + travel profile).
final class TravelWindowRepository: @unchecked Sendable {
    static let shared = TravelWindowRepository()

    func list() async throws -> [TravelWindow] {
        struct Response: Decodable { let items: [TravelWindow] }
        let r: Response = try await APIClient.shared.send("GET", "/api/travel-windows")
        return r.items
    }

    private struct CreateRequest: Encodable, Sendable {
        let dateFrom: String   // yyyy-MM-dd
        let dateTo: String
        let flexible: Bool
        let destinations: [String]?
        let notes: String?
    }

    /// Creates a window. Throws APIError.status(402, _) over the plan cap (the
    /// body's `error` is the upsell copy, surfaced verbatim by APIClient), or
    /// APIError.status(400, _) on invalid dates.
    func create(
        dateFrom: String,
        dateTo: String,
        flexible: Bool,
        destinations: [String],
        notes: String?
    ) async throws -> TravelWindow {
        struct Response: Decodable { let ok: Bool; let window: TravelWindow }
        let r: Response = try await APIClient.shared.send(
            "POST", "/api/travel-windows",
            body: CreateRequest(
                dateFrom: dateFrom,
                dateTo: dateTo,
                flexible: flexible,
                destinations: destinations.isEmpty ? nil : destinations,
                notes: (notes?.isEmpty == false) ? notes : nil
            )
        )
        return r.window
    }

    func delete(id: String) async throws {
        let _: EmptyResponse = try await APIClient.shared.send("DELETE", "/api/travel-windows/\(id)")
    }

    /// The AI proposals for a window. Throws APIError.status(409, _) with code
    /// NO_ACTIVE_LISTING when the member has no active listing to swap from.
    func proposals(windowId: String) async throws -> WindowProposalsResult {
        try await APIClient.shared.send("GET", "/api/travel-windows/\(windowId)/proposals")
    }
}
