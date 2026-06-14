import Foundation

// GET /api/config/support-contacts — the 24/7 phone line and help-centre URL
// surfaced from the "Report a problem" flow. These used to be hardcoded in the
// app; now they come from one server endpoint so ops can change them without a
// release. Public, no auth.
//
// Best-effort: callers start from the launch defaults and overlay the server
// values once they load, so the UI never blocks on this lookup.
final class SupportContactsRepository: @unchecked Sendable {
    static let shared = SupportContactsRepository()

    func fetch() async throws -> SupportContacts {
        try await APIClient.shared.send("GET", "/api/config/support-contacts")
    }
}

struct SupportContacts: Decodable, Sendable, Equatable {
    let phone: String
    let helpUrl: String

    static let fallback = SupportContacts(
        phone: "+44 800 000 swap",
        helpUrl: "https://swapl.fun/help"
    )
}
