import SwiftUI
import SwaplDesignTokens

// Real-time referrer toast (DOK-157). Closes the dopamine loop: while the
// account screen is open, poll GET /api/referrals/notifications for rewarded-
// but-unseen referral credits and toast them one at a time ("NAME just verified
// — you earned 20 Keys!"), acking each so it shows exactly once. Mirrors the web
// ReferrerNotifications component. Strictly best-effort — a failed poll just
// retries on the next tick, and the persisted unseen-credit is the source of
// truth so nothing is lost if the app was closed.
struct ReferrerNotificationsToast: View {
    private static let pollInterval: Duration = .seconds(20)
    private static let toastDuration: Duration = .seconds(6)

    @State private var queue: [ReferrerNotification] = []
    @State private var current: ReferrerNotification?
    @State private var seenIDs: Set<String> = []

    var body: some View {
        Group {
            if let current {
                Text(message(for: current))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.card)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(AirbnbPalette.text, in: Capsule())
                    .padding(.bottom, 24)
                    .shadow(radius: 12, y: 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { advance() }
            }
        }
        .task { await pollLoop() }
    }

    private func message(for n: ReferrerNotification) -> String {
        if let name = n.refereeName {
            return "\(name) just verified — you earned \(n.keys) Keys! 🔑"
        }
        return "Someone you invited just verified — you earned \(n.keys) Keys! 🔑"
    }

    private func pollLoop() async {
        while !Task.isCancelled {
            await poll()
            try? await Task.sleep(for: Self.pollInterval)
        }
    }

    private func poll() async {
        guard let fresh = try? await ReferralRepository.shared.notifications() else { return }
        // Oldest first so credits toast in the order they happened.
        let unseen = fresh.filter { !seenIDs.contains($0.id) }.reversed()
        guard !unseen.isEmpty else { return }
        for n in unseen {
            seenIDs.insert(n.id)
            queue.append(n)
        }
        // Ack immediately — local state drives the toast from here.
        let ids = unseen.map(\.id)
        Task { try? await ReferralRepository.shared.ackNotifications(ids: ids) }
        showNextIfIdle()
    }

    private func showNextIfIdle() {
        guard current == nil, !queue.isEmpty else { return }
        let next = queue.removeFirst()
        withAnimation { current = next }
        Task {
            try? await Task.sleep(for: Self.toastDuration)
            advance()
        }
    }

    private func advance() {
        withAnimation { current = nil }
        // Let the dismissal settle, then surface the next queued credit.
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            showNextIfIdle()
        }
    }
}
