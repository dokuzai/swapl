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
    // "Ways to earn Keys" catalogue, server-owned (DOK-164). Embedded in the
    // same GET /api/keys payload, so the wallet renders the list without a
    // second round-trip. Optional: an older server build may omit it.
    let earnWays: EarnWaysPayload?

    struct NightlyKeysListing: Decodable, Sendable, Identifiable {
        let listingId: String
        let title: String
        let nightlyKeys: Int
        var id: String { listingId }
    }
}

// MARK: - Ways to earn Keys (DOK-164)

// Mirrors lib/keys/earn-ways-dto.ts. Server-owned catalogue of the actions that
// mint Keys, with the founder-set amount, whether it repeats, the identity gate,
// and a per-user `done` flag. Keys are travel points, never money.
struct EarnWaysPayload: Decodable, Sendable {
    let identityVerified: Bool
    let ways: [EarnWay]
}

struct EarnWay: Decodable, Sendable, Identifiable {
    let key: String           // "verify_identity" | "verify_property" | ...
    let amount: Int
    let repeatable: Bool
    let gatedOnIdentity: Bool
    let kind: String
    let done: Bool

    var id: String { key }

    // Whether this row is currently locked behind identity verification.
    func isLocked(identityVerified: Bool) -> Bool {
        gatedOnIdentity && !identityVerified
    }

    // Encouraging, human title per action — hardcoded English coherent with web.
    var title: String {
        switch key {
        case "verify_identity": return "Verify your identity"
        case "verify_property": return "Verify a property"
        case "complete_listing": return "Complete your listing"
        case "leave_review": return "Leave a review"
        case "share_converted": return "Share a home that gets booked"
        case "refer_friend": return "Invite a friend"
        default: return key.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    var subtitle: String {
        switch key {
        case "verify_identity": return "A one-time bonus the moment you're verified."
        case "verify_property": return "Confirm a home is really yours."
        case "complete_listing": return "Fill in the details and photos of a home."
        case "leave_review": return "Tell the community how a stay went."
        case "share_converted": return "Earn when a home you shared turns into a booking."
        case "refer_friend": return "They join and verify — you both earn."
        default: return ""
        }
    }

    var symbol: String {
        switch key {
        case "verify_identity": return "checkmark.seal.fill"
        case "verify_property": return "house.and.flag.fill"
        case "complete_listing": return "square.and.pencil"
        case "leave_review": return "star.fill"
        case "share_converted": return "square.and.arrow.up"
        case "refer_friend": return "person.2.fill"
        default: return "key.horizontal.fill"
        }
    }
}

struct KeysTransaction: Decodable, Sendable, Identifiable {
    let id: String
    let delta: Int            // signed: +earned / -spent
    let kind: String          // "welcome_bonus" | "spend_stay" | "earn_host" | "earn_review" | ...
    // Human label straight from the server (keysKindLabel, covers every kind
    // including the DOK-164 earn_* ones). Optional so an older client/server
    // pairing still decodes; we fall back to a local map below.
    let label: String?
    let balanceAfter: Int
    let stayId: String?
    let note: String?
    let createdAt: String

    // Human label for the ledger row. Prefers the server `label`; falls back to
    // a local map (and finally the raw kind) so an unknown future kind still
    // renders sensibly.
    var displayLabel: String {
        if let label, !label.isEmpty { return label }
        switch kind {
        case "welcome", "welcome_bonus": return "Welcome bonus"
        case "spend_stay": return "Stay with Keys"
        case "earn_host": return "Hosted a Keys stay"
        case "hold": return "Held for a stay"
        case "release": return "Hold released"
        case "gift_sent": return "Gift sent"
        case "gift_received": return "Gift received"
        case "referral_bonus": return "Referral reward"
        case "invite_bonus": return "Invite bonus"
        case "refund": return "Refund"
        case "earn_property_verified": return "Verified your property"
        case "earn_review": return "Left a review"
        case "earn_share_converted": return "Your share got booked"
        case "earn_listing_complete": return "Completed a listing"
        default: return kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    // SF Symbol for the ledger row, so the filterable history reads at a glance.
    var symbol: String {
        switch kind {
        case "welcome", "welcome_bonus", "invite_bonus": return "sparkles"
        case "spend_stay": return "airplane.departure"
        case "earn_host": return "house.fill"
        case "hold": return "lock.fill"
        case "release": return "lock.open.fill"
        case "gift_sent": return "gift"
        case "gift_received": return "gift.fill"
        case "referral_bonus": return "person.2.fill"
        case "refund": return "arrow.uturn.backward"
        case "earn_property_verified": return "house.and.flag.fill"
        case "earn_review": return "star.fill"
        case "earn_share_converted": return "square.and.arrow.up"
        case "earn_listing_complete": return "square.and.pencil"
        default: return "key.horizontal.fill"
        }
    }

    // Coarse bucket used by the wallet's segmented filter. Every kind maps to
    // exactly one segment so the segmented control partitions the ledger cleanly.
    var category: KeysTransactionCategory {
        switch kind {
        case "earn_host", "welcome", "welcome_bonus", "referral_bonus", "invite_bonus",
             "gift_received", "refund", "release",
             "earn_property_verified", "earn_review", "earn_share_converted", "earn_listing_complete":
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

    // Adapt to the shared ListingAvailability shape so the Stay-with-Keys date
    // picker can reuse the same AvailabilityCalendar as the owner editor and the
    // browse filter. The keys-availability feed omits the per-range source, so
    // every range is reported as a generic "agreement" (the calendar only cares
    // that the day is taken, not why).
    var asListingAvailability: ListingAvailability {
        ListingAvailability(
            listingId: listingId,
            availableFrom: availableFrom,
            availableTo: availableTo,
            minStayDays: minStayDays,
            maxStayDays: maxStayDays,
            bookedRanges: bookedRanges.map {
                ListingAvailability.BookedRange(dateFrom: $0.dateFrom, dateTo: $0.dateTo, source: "agreement")
            }
        )
    }
}

// MARK: - Stays (GET /api/keys/stays)

struct KeysStay: Decodable, Sendable, Identifiable {
    let id: String
    let role: String          // "guest" | "host"
    var kind: String? = nil   // "keys" | "couchsurf"
    let listing: StayListing
    // The other party — host's name when I'm the guest, guest's when I host —
    // so the detail can show who the stay is with on both sides.
    var counterpartName: String? = nil
    var counterpartAvatar: String? = nil
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
        var photo: String? = nil
    }

    var isGuest: Bool { role == "guest" }
    var isPending: Bool { status == "pending" }
    var isCouchsurf: Bool { kind == "couchsurf" }
}

struct KeysStaysResponse: Decodable, Sendable {
    let stays: [KeysStay]
}

// Rich single-stay detail (GET /api/keys/stays/{id}) — the data the standard
// trip view needs: fuzzed area + address (once confirmed), the counterpart's
// off-platform contacts (once confirmed), and the cover policy.
struct KeysStayDetail: Decodable, Sendable {
    let id: String
    // The per-transaction conversation (DOK-221) — opens the in-app chat.
    var conversationId: String? = nil
    let role: String
    var kind: String? = nil
    let status: String
    let dateFrom: String
    let dateTo: String
    let nights: Int
    let keysCost: Int
    let insurancePolicyId: String?
    let listing: DetailListing
    let counterpart: Counterpart

    struct DetailListing: Decodable, Sendable {
        let id: String
        let title: String
        let city: String
        var neighbourhood: String? = nil
        var photo: String? = nil
        var lat: Double? = nil
        var lng: Double? = nil
        var address: String? = nil
    }
    struct Counterpart: Decodable, Sendable {
        var name: String? = nil
        var avatar: String? = nil
        var contactChannels: ContactChannels? = nil
        var hasContactChannels: Bool? = nil
    }

    var isGuest: Bool { role == "guest" }
}

// MARK: - Request/response payloads

struct KeysStayRequest: Encodable, Sendable {
    let listingId: String
    let dateFrom: String
    let dateTo: String
    // DOK-219: "couchsurf" sends a free, membership-gated request; omitted/"keys"
    // spends Keys as usual.
    var kind: String? = nil
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
