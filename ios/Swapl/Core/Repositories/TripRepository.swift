import Foundation

// Trip cockpit + home guide networking (DOK-152). Wraps the agreement trip
// payload, the per-listing home guide GET/PUT, and the check-in/check-out
// POSTs. All reveal gating is server-side — this layer just relays whatever the
// server chose to send (locked hint vs. full content).
final class TripRepository: @unchecked Sendable {
    static let shared = TripRepository()

    // GET /api/agreements/{id}/trip
    func cockpit(agreementId: String) async throws -> TripCockpit {
        try await APIClient.shared.send("GET", "/api/agreements/\(agreementId)/trip")
    }

    // GET /api/listings/{id}/home-guide
    func homeGuide(listingId: String) async throws -> HomeGuideResponse {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/home-guide")
    }

    // PUT /api/listings/{id}/home-guide — owner-only partial upsert.
    struct PutGuideResponse: Decodable, Sendable {
        let ok: Bool
        let guide: HomeGuide?
    }

    @discardableResult
    func saveHomeGuide(listingId: String, _ update: HomeGuideUpdate) async throws -> PutGuideResponse {
        try await APIClient.shared.send(
            "PUT", "/api/listings/\(listingId)/home-guide", body: update
        )
    }

    // POST /api/agreements/{id}/check-in | check-out. Idempotent per party.
    struct CheckEventBody: Encodable, Sendable {
        let note: String?
        let photos: [String]?
    }

    struct CheckEventResponse: Decodable, Sendable {
        let ok: Bool
        let event: Event
        let duplicate: Bool?

        struct Event: Decodable, Sendable {
            let id: String
            let type: String
            let note: String?
            let photos: [String]
            let createdAt: String
        }
    }

    @discardableResult
    func checkIn(agreementId: String, note: String?, photos: [String]) async throws -> CheckEventResponse {
        try await APIClient.shared.send(
            "POST", "/api/agreements/\(agreementId)/check-in",
            body: CheckEventBody(note: note?.isEmpty == true ? nil : note,
                                 photos: photos.isEmpty ? nil : photos)
        )
    }

    @discardableResult
    func checkOut(agreementId: String, note: String?, photos: [String]) async throws -> CheckEventResponse {
        try await APIClient.shared.send(
            "POST", "/api/agreements/\(agreementId)/check-out",
            body: CheckEventBody(note: note?.isEmpty == true ? nil : note,
                                 photos: photos.isEmpty ? nil : photos)
        )
    }
}
