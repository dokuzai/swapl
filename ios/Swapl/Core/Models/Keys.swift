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
        case "referral_bonus": return "Friend joined & verified"
        case "invite_bonus": return "Welcome — you were invited"
        case "refund": return "Refund"
        default: return kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    // SF Symbol for the ledger row, so the filterable history reads at a glance.
    var symbol: String {
        switch kind {
        case "welcome", "invite_bonus": return "sparkles"
        case "spend_stay": return "airplane.departure"
        case "earn_host": return "house.fill"
        case "hold": return "lock.fill"
        case "release": return "lock.open.fill"
        case "gift_sent": return "gift"
        case "gift_received": return "gift.fill"
        case "referral_bonus": return "person.2.fill"
        case "refund": return "arrow.uturn.backward"
        default: return "key.horizontal.fill"
        }
    }

    // Coarse bucket used by the wallet's segmented filter. Every kind maps to
    // exactly one segment so the segmented control partitions the ledger cleanly.
    var category: KeysTransactionCategory {
        switch kind {
        case "earn_host", "welcome", "referral_bonus", "invite_bonus", "gift_received", "refund", "release":
            return .earned
        case "spend_stay", "hold", "gift_sent":
            return .spent
        default:
            return delta >= 0 ? .earned : .spent
        }
    }
}

// Segments for the filterable Keys history (DOK-157). `all` shows everything;
// `earned`/`spent` partition by the direction the points moved.
enum KeysTransactionCategory: String, CaseIterable, Identifiable, Sendable {
    case all
    case earned
    case spent

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .earned: return "Earned"
        case .spent: return "Spent"
        }
    }

    func matches(_ tx: KeysTransaction) -> Bool {
        self == .all || tx.category == self
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
