import AuthenticationServices
import SwiftUI
import UIKit
import SwaplDesignTokens

// "Verify your identity" card for AccountView — Didit hosted verification.
//
// Hidden unless GET /api/verification/status says the feature is enabled AND
// the user isn't verified yet (env-gated, never broken). Tapping it mints a
// hosted Didit session and opens it in ASWebAuthenticationSession; when the
// sheet closes (callback or manual dismiss) we re-poll status and refresh
// /api/me so the existing "ID verified" badge updates.
struct IdentityVerificationCard: View {
    @Environment(AuthService.self) private var auth
    @State private var status: VerificationStatus?
    @State private var busy = false
    @State private var error: String?
    @State private var webSession = HostedVerificationSession()
    @State private var rewardToast: ReferralReward?

    var body: some View {
        Group {
            if let status, status.enabled, !status.verified {
                card(status: status)
            }
        }
        .task { await loadStatus() }
        .overlay(alignment: .bottom) {
            if let reward = rewardToast {
                Text(rewardMessage(reward))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.card)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(AirbnbPalette.text, in: Capsule())
                    .padding(.bottom, 24)
                    .shadow(radius: 12, y: 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { withAnimation { rewardToast = nil } }
            }
        }
    }

    private func rewardMessage(_ reward: ReferralReward) -> String {
        if let name = reward.referrerName {
            return "Verified! \(name)'s invite just earned you \(reward.keys) Keys. 🔑"
        }
        return "Verified! You earned \(reward.keys) Keys for joining via a referral. 🔑"
    }

    private func card(status: VerificationStatus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                startVerification()
            } label: {
                HStack(spacing: 18) {
                    ZStack {
                        RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                            .fill(SwaplSemanticLight.accent)
                        if busy {
                            ProgressView().tint(SwaplSemanticLight.primary)
                        } else {
                            Image(systemName: "checkmark.shield")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.primary)
                        }
                    }
                    .frame(width: 64, height: 64)

                    VStack(alignment: .leading, spacing: 5) {
                        Text(title(for: status.status))
                            .font(.swaplDisplay(20, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                        Text(subtitle(for: status.status))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .padding(18)
            }
            .buttonStyle(.plain)
            .disabled(busy)

            if let error {
                Text(error)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.destructive)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 14)
            }
        }
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private func title(for state: String) -> String {
        switch state {
        case "pending": return "Finish verifying your identity"
        case "declined": return "Verification didn't go through"
        default: return "Verify your identity"
        }
    }

    private func subtitle(for state: String) -> String {
        switch state {
        case "pending": return "Pick up where you left off — it takes about two minutes."
        case "declined": return "You can try again with a clearer photo of your ID."
        default: return "Get the ID-verified badge hosts trust. Takes about two minutes."
        }
    }

    private func loadStatus() async {
        let fresh = try? await VerificationRepository.shared.status()
        status = fresh
        // Post-verify referral toast: show once when the status carries a paid
        // reward, then auto-dismiss. Best-effort; nil reward shows nothing.
        if let reward = fresh?.referralReward, reward.keys > 0, rewardToast == nil {
            withAnimation { rewardToast = reward }
            Task {
                try? await Task.sleep(for: .seconds(5))
                withAnimation { rewardToast = nil }
            }
        }
    }

    private func startVerification() {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let start = try await VerificationRepository.shared.createSession()
                if start.status == "approved" {
                    await finish()
                    return
                }
                guard let raw = start.url, let url = URL(string: raw) else {
                    error = "Verification is unavailable right now. Try again later."
                    return
                }
                await webSession.present(url: url)
                await finish()
            } catch APIClient.APIError.status(503, _) {
                // Feature switched off server-side since the status fetch — hide.
                status = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    // After the hosted sheet closes: converge our row (the status route also
    // polls Didit when webhooks aren't configured) and refresh /api/me so the
    // profile badge flips without an app restart.
    private func finish() async {
        await loadStatus()
        await auth.refreshSession()
    }
}

// Hosted-page presenter. The Didit callback returns to
// https://<app>/dashboard?verification=done; on iOS 17.4+ we catch it with an
// https callback and auto-dismiss, on earlier versions the user closes the
// sheet manually ("Cancel") — either way the continuation resumes and the
// caller re-polls status.
@MainActor
final class HostedVerificationSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    func present(url: URL) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let completion: ASWebAuthenticationSession.CompletionHandler = { _, _ in
                continuation.resume()
            }
            let session: ASWebAuthenticationSession
            if #available(iOS 17.4, *), let host = APIClient.shared.baseURL.host {
                session = ASWebAuthenticationSession(
                    url: url,
                    callback: .https(host: host, path: "/dashboard"),
                    completionHandler: completion
                )
            } else {
                // The custom scheme never fires for an https callback; the user
                // dismisses the sheet and we land in the same completion.
                session = ASWebAuthenticationSession(
                    url: url,
                    callbackURLScheme: "swapl",
                    completionHandler: completion
                )
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            session.start()
        }
        activeSession = nil
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
