import Foundation

// Keys wallet + Stay-with-Keys models (DOK-155). Keys are "travel points",
// never money: they cannot be bought or cashed out, only earned, spent on a
// stay, or gifted to a verified friend. These mirror the web API in
// app/app/api/keys/* exactly so the same backend serves all clients.

// MARK: - Wallet (GET /api/keys)

struct KeysWallet: Decodable, Sendable {
    let balance: Int
    let nightlyKeysForMyListings: [NightlyKeysListing]
    let recentTransactions: [KeysTransaction]

    struct NightlyKeysListing: Decodable, Sendable, Identifiable {
        let listingId: String
        let title: String
        let nightlyKeys: Int
        var id: String { listingId }
    }
}

struct KeysTransaction: Decodable, Sendable, Identifiable {
    let id: String
    let delta: Int            // signed: +earned / -spent
    let kind: String          // "welcome" | "spend_stay" | "earn_host" | "hold" | "release" | "gift_sent" | "gift_received" | ...
    let balanceAfter: Int
    let stayId: String?
    let note: String?
    let createdAt: String

    // Human label for the ledger row. Falls back to the raw kind so an
    // unknown future kind still renders sensibly.
    var displayLabel: String {
        switch kind {
        case "welcome": return "Welcome points"
        case "spend_stay": return "Stay booked"
        case "earn_host": return "Hosted a stay"
        case "hold": return "Held for a stay"
        case "release": return "Hold released"
        case "gift_sent": return "Gift sent"
        case "gift_received": return "Gift received"
        default: return kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

// MARK: - Stay availability (GET /api/listings/{id}/keys-availability)

struct KeysAvailability: Decodable, Sendable {
    let listingId: String
    let nightlyKeys: Int
    let availableFrom: String
    let availableTo: String
    let minStayDays: Int
    let maxStayDays: Int
    let bookedRanges: [BookedRange]

    struct BookedRange: Decodable, Sendable, Hashable {
        let dateFrom: String
        let dateTo: String
    }
}

// MARK: - Stays (GET /api/keys/stays)

struct KeysStay: Decodable, Sendable, Identifiable {
    let id: String
    let role: String          // "guest" | "host"
    let listing: StayListing
    let dateFrom: String
    let dateTo: String
    let nights: Int
    let keysCost: Int
    let status: String        // "pending" | "confirmed" | "declined" | "cancelled" | "completed"
    let insurancePolicyId: String?
    let createdAt: String

    struct StayListing: Decodable, Sendable {
        let id: String
        let title: String
        let city: String
    }

    var isGuest: Bool { role == "guest" }
    var isPending: Bool { status == "pending" }
}

struct KeysStaysResponse: Decodable, Sendable {
    let stays: [KeysStay]
}

// MARK: - Request/response payloads

struct KeysStayRequest: Encodable, Sendable {
    let listingId: String
    let dateFrom: String
    let dateTo: String
}

struct KeysStayCreateResponse: Decodable, Sendable {
    let ok: Bool
    let stayId: String
    let status: String
    let nights: Int
    let keysCost: Int
}

struct KeysGiftRequest: Encodable, Sendable {
    let toUserId: String
    let amount: Int
}

struct KeysGiftResponse: Decodable, Sendable {
    let ok: Bool
    let amount: Int
    let balanceAfter: Int
    let recipientBalanceAfter: Int
}

struct KeysStayActionResponse: Decodable, Sendable {
    let ok: Bool
    let stayId: String
    let keysCost: Int?
}
