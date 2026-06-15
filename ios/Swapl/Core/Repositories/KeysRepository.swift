import Foundation

// Keys wallet + Stay-with-Keys networking (DOK-155). Thin relay over the same
// /api/keys endpoints the web/Android clients use. The credit ledger lives
// server-side; this layer never computes balances or costs locally.
final class KeysRepository: @unchecked Sendable {
    static let shared = KeysRepository()

    // GET /api/keys — the caller's wallet: balance, nightly-Keys for their
    // own listings, and recent ledger transactions.
    func wallet() async throws -> KeysWallet {
        try await APIClient.shared.send("GET", "/api/keys")
    }

    // GET /api/listings/{id}/keys-availability — nightly Keys + bookable window
    // for a Stay-with-Keys on this listing.
    func availability(listingId: String) async throws -> KeysAvailability {
        try await APIClient.shared.send("GET", "/api/listings/\(listingId)/keys-availability")
    }

    // GET /api/keys/stays — the caller's stays, both as guest and host.
    func stays() async throws -> KeysStaysResponse {
        try await APIClient.shared.send("GET", "/api/keys/stays")
    }

    // POST /api/keys/stays — request a stay. Holds the guest's Keys and notifies
    // the host. A 422 with "enough" in the message means insufficient balance.
    func requestStay(listingId: String, dateFrom: String, dateTo: String) async throws -> KeysStayCreateResponse {
        try await APIClient.shared.send(
            "POST", "/api/keys/stays",
            body: KeysStayRequest(listingId: listingId, dateFrom: dateFrom, dateTo: dateTo)
        )
    }

    // POST /api/keys/gift — gift Keys to a verified member. Never overdraws.
    func gift(toUserId: String, amount: Int) async throws -> KeysGiftResponse {
        try await APIClient.shared.send(
            "POST", "/api/keys/gift",
            body: KeysGiftRequest(toUserId: toUserId, amount: amount)
        )
    }

    // Host confirms a pending stay → the hold becomes a real spend/earn and a
    // cover policy is issued.
    @discardableResult
    func confirmStay(id: String) async throws -> KeysStayActionResponse {
        try await APIClient.shared.send("POST", "/api/keys/stays/\(id)/confirm", body: EmptyBody())
    }

    // Host declines a pending stay → the guest's hold is released.
    @discardableResult
    func declineStay(id: String) async throws -> KeysStayActionResponse {
        try await APIClient.shared.send("POST", "/api/keys/stays/\(id)/decline", body: EmptyBody())
    }

    // Guest cancels their own pending stay → the hold is released.
    @discardableResult
    func cancelStay(id: String) async throws -> KeysStayActionResponse {
        try await APIClient.shared.send("POST", "/api/keys/stays/\(id)/cancel", body: EmptyBody())
    }
}

// The confirm/decline/cancel routes take no body; send an empty JSON object so
// the Content-Type header is set and Next's req.json() doesn't choke.
private struct EmptyBody: Encodable {}
