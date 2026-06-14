import Foundation
import Observation

// Drives the unread badge on the Messages tab (DOK-154). Polls
// GET /api/conversations lightly while the app is in the foreground; the
// total is the sum of inbound unread across the viewer's swap threads.
@MainActor
@Observable
final class UnreadStore {
    var totalUnread = 0

    func refresh() async {
        do {
            let response = try await ChatRepository.shared.conversations()
            totalUnread = response.totalUnread
        } catch {
            // Best-effort: leave the last known count on a transient failure.
        }
    }

    func reset() {
        totalUnread = 0
    }
}
