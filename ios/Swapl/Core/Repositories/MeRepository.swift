import Foundation

final class MeRepository: @unchecked Sendable {
    static let shared = MeRepository()
    func me() async throws -> MeResponse {
        try await APIClient.shared.send("GET", "/api/me")
    }
}
