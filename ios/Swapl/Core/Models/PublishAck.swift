import Foundation

// Canonical publish acknowledgment (DOK-162) — mirrors lib/listing/publish-ack.ts.
//
// LEGAL FRAMING (do not soften): the line that matters is NOT money, it is
// whether the host *cedes enjoyment of the home to a third party*.
//   - Hosting with the host present, or letting a room, is plain hospitality
//     (like relatives staying over): no permission is ever required, even for a
//     tenant. -> .roomOrHostPresent (light) variant.
//   - Handing over the *entire home while the host is away* is a cession of
//     enjoyment: a tenant's lease typically forbids subletting/loan-for-use
//     without the landlord's consent (money or not). An owner is free to do so
//     unless the condominium rules say otherwise. -> .entireHomeWhileAway variant.
//
// This is a SELF-ATTESTATION the backend logs append-only (ListingPublishAck),
// never a proof check. Publishing is NEVER gated on proof of ownership or a
// landlord's permit. Property verification (the "Verified owner" badge) is a
// separate, strictly optional flow.
enum PublishAckMode: String, CaseIterable, Sendable {
    case entireHomeWhileAway = "entire_home_while_away"
    case roomOrHostPresent = "room_or_host_present"

    // The choice the host makes in the publish flow, in plain language.
    var pickerTitle: String {
        switch self {
        case .entireHomeWhileAway: return "My whole home while I'm away"
        case .roomOrHostPresent: return "A room, or my home while I'm here"
        }
    }

    var pickerSubtitle: String {
        switch self {
        case .entireHomeWhileAway:
            return "Guests have the place to themselves."
        case .roomOrHostPresent:
            return "Plain hospitality — like having friends stay over."
        }
    }

    // Canonical attestation text, kept verbatim in sync with publish-ack.ts so
    // the row the backend logs always matches what the host actually read.
    var ackText: String {
        switch self {
        case .entireHomeWhileAway:
            return "I confirm I have the right to offer this entire home for a swap while I'm away. "
                + "If I rent it, I have my landlord's consent to host guests in my absence as my lease "
                + "requires, and I comply with any condominium or building rules. I understand swapl "
                + "does not verify this and that I alone am responsible for having the right to host."
        case .roomOrHostPresent:
            return "I confirm I'm offering hospitality in a home I live in — a room, or my home while "
                + "I'm present as host. I'll respect any condominium or building rules and I'm "
                + "responsible for the stay I host."
        }
    }
}

// Bump when either variant's wording changes; old acks keep their version.
enum PublishAck {
    static let version = "v1"
}
