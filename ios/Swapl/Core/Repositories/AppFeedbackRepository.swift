import Foundation

// In-app "Rate the app" feedback (F2 / M1). Posts a structured score + optional
// comment to the shared backend's AppFeedback endpoint. The same model serves
// iOS and Android; only `source` differs ("ios" here).
//
// POST /api/app-feedback expects:
//   { score: 1...5, comment?: String, source: "ios", surface: "account",
//     contextKey: "", context?: [String: …] }
final class AppFeedbackRepository: @unchecked Sendable {
    static let shared = AppFeedbackRepository()

    struct FeedbackBody: Encodable {
        let score: Int
        let comment: String?
        let source: String
        let surface: String
        let contextKey: String
    }

    @discardableResult
    func submit(
        score: Int,
        comment: String?,
        surface: String = "account",
        contextKey: String = ""
    ) async throws -> EmptyResponse {
        let trimmed = comment?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = FeedbackBody(
            score: score,
            comment: (trimmed?.isEmpty == false) ? trimmed : nil,
            source: "ios",
            surface: surface,
            contextKey: contextKey
        )
        return try await APIClient.shared.send("POST", "/api/app-feedback", body: body)
    }
}
