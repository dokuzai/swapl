import Foundation

// Trip cockpit models (DOK-152). Mirror app/app/api/agreements/[id]/trip and
// app/app/api/listings/[id]/home-guide. Reveal gating is enforced SERVER-SIDE:
// before the gate opens, `otherAddress` and `otherGuide.fields` are nil and the
// payload only carries a `locked`/`unlocksAt` hint — the client renders the
// locked state but never has the other home's address or guide content.

// MARK: - Trip cockpit

struct TripCockpit: Decodable, Sendable {
    let agreementId: String
    let proposalId: String
    let phase: TripCockpitPhase
    let role: String              // "host1" | "host2"
    let dates: Dates
    let countdown: Countdown
    let keyCodes: KeyCodes
    let insurance: TripInsurance?
    let addressUnlocked: Bool
    let otherAddress: String?     // nil until addressUnlocked
    let otherCity: String?
    let otherGuide: OtherGuide?
    let myGuideCompleteness: Int  // 0..100
    let otherGuideCompleteness: Int
    let checklist: Checklist
    let checkEvents: [TripCheckEvent]

    struct Dates: Decodable, Sendable {
        let from: String
        let to: String
    }

    struct Countdown: Decodable, Sendable {
        let days: Int
        let hours: Int
    }

    struct KeyCodes: Decodable, Sendable {
        let mine: String?
    }

    struct Checklist: Decodable, Sendable {
        let guideFilled: Bool
        let detailsRead: Bool
        let checkedIn: Bool
        let checkedOut: Bool
    }
}

// Persisted lifecycle is coarse (ACTIVE/COMPLETED/INTERRUPTED); the phase is a
// finer derived view the server computes from dates + check-in events.
enum TripCockpitPhase: String, Decodable, Sendable {
    case agreed = "AGREED"
    case preparing = "PREPARING"
    case ready = "READY"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case interrupted = "INTERRUPTED"

    // Unknown / future phase strings degrade gracefully to "preparing".
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "AGREED": self = .agreed
        case "PREPARING": self = .preparing
        case "READY": self = .ready
        case "IN_PROGRESS": self = .inProgress
        case "COMPLETED": self = .completed
        case "INTERRUPTED": self = .interrupted
        default: self = .preparing
        }
    }
}

struct TripInsurance: Decodable, Sendable {
    let policyNumber: String
    let coverageAmount: Int
    let status: String
    let expiresAt: String
}

// The other home's guide. When the reveal gate is open the server sends the
// guide fields; before that it sends `{ locked: true, unlocksAt }`. We decode
// both shapes into one optional-laden struct.
struct OtherGuide: Decodable, Sendable {
    let locked: Bool
    let unlocksAt: String?
    let fields: HomeGuideFields?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicKey.self)
        let lockedValue = (try? container.decode(Bool.self, forKey: DynamicKey("locked"))) ?? false
        self.locked = lockedValue
        self.unlocksAt = try? container.decode(String.self, forKey: DynamicKey("unlocksAt"))
        self.fields = lockedValue ? nil : try? HomeGuideFields(from: decoder)
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }
}

struct TripCheckEvent: Decodable, Identifiable, Sendable {
    let id: String
    let userId: String
    let type: String          // "checkin" | "checkout"
    let note: String?
    let photos: [String]
    let createdAt: String
    let mine: Bool
}

// MARK: - Home guide

// The full guide field set shared by the trip cockpit ("Where you're staying")
// and the owner's editor. All optional — a guide is a partial upsert.
struct HomeGuideFields: Decodable, Sendable {
    let accessInstructions: String?
    let keyPickup: String?
    let wifiName: String?
    let wifiPassword: String?
    let heatingCooling: String?
    let kitchen: String?
    let bins: String?
    let petsPlants: String?
    let houseRules: String?
    let neighbourhood: String?
    let emergencyContact: String?
}

// GET /api/listings/{id}/home-guide. The owner always reads/writes; a
// counterparty reads only once the gate opens, else { locked, unlocksAt }.
struct HomeGuideResponse: Decodable, Sendable {
    let guide: HomeGuide?
    let isOwner: Bool
    let locked: Bool
    let unlocksAt: String?
}

struct HomeGuide: Decodable, Sendable {
    let accessInstructions: String?
    let keyPickup: String?
    let wifiName: String?
    let wifiPassword: String?
    let heatingCooling: String?
    let kitchen: String?
    let bins: String?
    let petsPlants: String?
    let houseRules: String?
    let neighbourhood: String?
    let emergencyContact: String?
    let updatedAt: String?
    let completeness: Int?    // 0..100 over the 8 core fields
    let complete: Bool?
}

// PUT body for the owner editor — partial upsert. We encode ONLY the keys that
// are non-nil: on the server an explicit null clears a field, while an absent
// key is left untouched. A custom encoder (not the default, which would emit
// `null` for every nil Optional) preserves that partial-upsert contract.
struct HomeGuideUpdate: Encodable, Sendable {
    var accessInstructions: String?
    var keyPickup: String?
    var wifiName: String?
    var wifiPassword: String?
    var heatingCooling: String?
    var kitchen: String?
    var bins: String?
    var petsPlants: String?
    var houseRules: String?
    var neighbourhood: String?
    var emergencyContact: String?

    enum CodingKeys: String, CodingKey {
        case accessInstructions, keyPickup, wifiName, wifiPassword, heatingCooling
        case kitchen, bins, petsPlants, houseRules, neighbourhood, emergencyContact
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(accessInstructions, forKey: .accessInstructions)
        try c.encodeIfPresent(keyPickup, forKey: .keyPickup)
        try c.encodeIfPresent(wifiName, forKey: .wifiName)
        try c.encodeIfPresent(wifiPassword, forKey: .wifiPassword)
        try c.encodeIfPresent(heatingCooling, forKey: .heatingCooling)
        try c.encodeIfPresent(kitchen, forKey: .kitchen)
        try c.encodeIfPresent(bins, forKey: .bins)
        try c.encodeIfPresent(petsPlants, forKey: .petsPlants)
        try c.encodeIfPresent(houseRules, forKey: .houseRules)
        try c.encodeIfPresent(neighbourhood, forKey: .neighbourhood)
        try c.encodeIfPresent(emergencyContact, forKey: .emergencyContact)
    }
}
