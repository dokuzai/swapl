import Foundation

// Availability calendar networking (DOK-159). Thin relay over the same
// /api/listings/{id}/calendar and /blocked-ranges endpoints the web client uses.
// The "what counts as taken" rule lives server-side (lib/listing/availability.ts);
// this layer never recomputes it.
final class CalendarRepository: @unchecked Sendable {
    static let shared = CalendarRepository()

    // GET /api/listings/{id}/calendar — public availability snapshot (window +
    // every booked range). Used by the Stay-with-Keys picker, the filter date
    // picker and the read-only side of the owner calendar editor.
    func availability(listingId: String) async throws -> ListingAvailability {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/calendar")
    }

    // GET /api/listings/{id}/blocked-ranges — owner-only host blocks, with ids
    // and notes so the editor can list and delete them individually.
    func hostBlocks(listingId: String) async throws -> HostBlockedRangesResponse {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/blocked-ranges")
    }

    // POST — block a date range (renovations, personal use). Owner-only.
    @discardableResult
    func blockDates(listingId: String, dateFrom: String, dateTo: String, note: String?) async throws -> HostBlockCreateResponse {
        try await APIClient.shared.send(
            "POST", "/api/listings/\(listingId)/blocked-ranges",
            body: HostBlockCreateRequest(dateFrom: dateFrom, dateTo: dateTo, note: note)
        )
    }

    // DELETE — unblock a range by id. Owner-only.
    @discardableResult
    func unblock(listingId: String, rangeId: String) async throws -> EmptyResponse {
        try await APIClient.shared.send(
            "DELETE", "/api/listings/\(listingId)/blocked-ranges",
            body: HostBlockDeleteRequest(rangeId: rangeId)
        )
    }

    // POST — open a date range so it becomes bookable (DOK-219). The inverse of
    // blockDates; carves the span out of the host's closed blocks. Owner-only.
    @discardableResult
    func openDates(listingId: String, dateFrom: String, dateTo: String) async throws -> EmptyResponse {
        try await APIClient.shared.send(
            "POST", "/api/listings/\(listingId)/availability",
            body: OpenDatesRequest(dateFrom: dateFrom, dateTo: dateTo)
        )
    }
}

private struct OpenDatesRequest: Encodable, Sendable {
    let dateFrom: String
    let dateTo: String
}
