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
    // Single-line option labels only — the ack text below explains the rest.
    var pickerTitle: String {
        switch self {
        case .entireHomeWhileAway: return "The whole home, while I'm away"
        case .roomOrHostPresent: return "A room, or while I'm here"
        }
    }

    // Canonical attestation, split into a normal-weight headline and a
    // smaller/muted fineprint, kept verbatim in sync with publish-ack.ts so the
    // row the backend logs always matches what the host actually read.
    var ackHeadline: String {
        switch self {
        case .entireHomeWhileAway:
            return "I have the right to offer my whole home for a swap while I'm away — and if I rent, my lease lets me host guests when I'm not there."
        case .roomOrHostPresent:
            return "I have the right to host this swap."
        }
    }

    var ackFineprint: String {
        switch self {
        case .entireHomeWhileAway:
            return "I'm responsible for following my lease, building rules, and local laws."
        case .roomOrHostPresent:
            return "I'll follow my building rules and local laws."
        }
    }

    // The logged/submitted attestation = headline + " " + fineprint.
    var ackText: String {
        ackHeadline + " " + ackFineprint
    }
}

// Bump when either variant's wording changes; old acks keep their version.
enum PublishAck {
    static let version = "v1"
}
