import Foundation
import Observation

// Drives the unread badge on the Messages tab (DOK-154/DOK-221). Polls the
// unified conversations list lightly while the app is in the foreground; the
// total is the sum of inbound unread across BOTH swap and stay threads.
@MainActor
@Observable
final class UnreadStore {
    var totalUnread = 0

    func refresh() async {
        do {
            let response = try await ConversationRepository.shared.list()
            totalUnread = response.totalUnread
        } catch {
            // Best-effort: leave the last known count on a transient failure.
        }
    }

    func reset() {
        totalUnread = 0
    }
}
