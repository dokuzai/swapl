import Foundation

// Didit identity verification (hosted flow).
//
// The backend is env-gated: with Didit unconfigured, /status still answers
// (enabled=false → the client hides the CTA) while /session returns 503.

// GET /api/verification/status
struct VerificationStatus: Decodable, Sendable {
    let enabled: Bool
    /// "none" | "pending" | "approved" | "declined" | ...
    let status: String
    let verified: Bool
    let verifiedAt: String?
    let completedAt: String?
}

// POST /api/verification/session — `url` is the hosted Didit page (nil once
// already approved).
struct VerificationSessionStart: Decodable, Sendable {
    let status: String
    let url: String?
}

final class VerificationRepository: @unchecked Sendable {
    static let shared = VerificationRepository()

    func status() async throws -> VerificationStatus {
        try await APIClient.shared.send("GET", "/api/verification/status")
    }

    func createSession() async throws -> VerificationSessionStart {
        try await APIClient.shared.send("POST", "/api/verification/session")
    }
}
