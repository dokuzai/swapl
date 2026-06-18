import Foundation

// Off-platform contact channels (DOK-204). Decoded from GET /api/me (own) and
// the proposal detail (counterparty, only when a swap is accepted); encoded for
// PATCH /api/profile (full-replace). Mirrors app/lib/contact-channels.ts.
struct ContactChannels: Codable, Sendable, Hashable {
    var email: String?
    var phone: String?
    var whatsapp: String?
    var telegram: String?
    var instagram: String?
    var discord: String?
    var website: String?

    var isEmpty: Bool { present.isEmpty }

    func value(for kind: ContactChannelKind) -> String? {
        switch kind {
        case .email: email
        case .phone: phone
        case .whatsapp: whatsapp
        case .telegram: telegram
        case .instagram: instagram
        case .discord: discord
        case .website: website
        }
    }

    mutating func set(_ kind: ContactChannelKind, _ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = trimmed.isEmpty ? nil : trimmed
        switch kind {
        case .email: email = value
        case .phone: phone = value
        case .whatsapp: whatsapp = value
        case .telegram: telegram = value
        case .instagram: instagram = value
        case .discord: discord = value
        case .website: website = value
        }
    }

    /// Non-empty channels in display order.
    var present: [(kind: ContactChannelKind, value: String)] {
        ContactChannelKind.allCases.compactMap { kind in
            guard let v = value(for: kind), !v.isEmpty else { return nil }
            return (kind, v)
        }
    }
}

enum ContactChannelKind: String, CaseIterable, Identifiable, Sendable {
    case email, phone, whatsapp, telegram, instagram, discord, website

    var id: String { rawValue }

    var label: String {
        switch self {
        case .email: String(localized: "Email")
        case .phone: String(localized: "Phone")
        case .whatsapp: String(localized: "WhatsApp")
        case .telegram: String(localized: "Telegram")
        case .instagram: String(localized: "Instagram")
        case .discord: String(localized: "Discord")
        case .website: String(localized: "Website")
        }
    }

    var systemImage: String {
        switch self {
        case .email: "envelope.fill"
        case .phone: "phone.fill"
        case .whatsapp: "message.fill"
        case .telegram: "paperplane.fill"
        case .instagram: "camera.fill"
        case .discord: "bubble.left.and.bubble.right.fill"
        case .website: "globe"
        }
    }

    var placeholder: String {
        switch self {
        case .email: "you@example.com"
        case .phone, .whatsapp: "+39 320 123 4567"
        case .telegram, .instagram: "@handle"
        case .discord: "username"
        case .website: "https://…"
        }
    }

    /// A tappable URL for a stored value, or nil when the channel isn't directly
    /// linkable (Discord usernames have no reliable deep link — shown as text)
    /// or the value can't form a usable URL.
    func url(for value: String) -> URL? {
        // Handles may be entered with a leading @ (the placeholder invites it);
        // strip it and percent-encode before putting it in a path.
        let handle = String(value.drop(while: { $0 == "@" }))
            .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""
        switch self {
        case .email:
            return URL(string: "mailto:\(value)")
        case .phone:
            let digits = value.filter { $0 == "+" || $0.isNumber }
            return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
        case .whatsapp:
            let digits = value.filter(\.isNumber)
            return digits.isEmpty ? nil : URL(string: "https://wa.me/\(digits)")
        case .telegram:
            return handle.isEmpty ? nil : URL(string: "https://t.me/\(handle)")
        case .instagram:
            return handle.isEmpty ? nil : URL(string: "https://instagram.com/\(handle)")
        case .discord:
            return nil
        case .website:
            let hasScheme = value.hasPrefix("http://") || value.hasPrefix("https://")
            return URL(string: hasScheme ? value : "https://\(value)")
        }
    }
}
