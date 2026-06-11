import SwiftUI
import SwaplDesignTokens

// Profile → Passkeys. The API has no list endpoint yet (only register +
// DELETE /api/auth/passkey/{id}), so this screen is enroll-only: it explains
// what a passkey is and adds one for this account via the system sheet.
struct PasskeysView: View {
    @Environment(AuthService.self) private var auth
    @State private var isAdding = false
    @State private var addedThisSession = 0
    @State private var error: String?

    var body: some View {
        ScrollView {
            SwaplPageTitle("Passkeys")
            VStack(alignment: .leading, spacing: 18) {
                explainerCard

                if addedThisSession > 0 {
                    successCard
                }

                if let error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                }

                Button {
                    addPasskey()
                } label: {
                    HStack(spacing: 10) {
                        if isAdding {
                            ProgressView().tint(SwaplSemanticLight.primaryForeground)
                        } else {
                            Image(systemName: "plus")
                        }
                        Text(addedThisSession > 0 ? "Add another passkey" : "Add a passkey")
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .disabled(isAdding)

                Text("You can remove passkeys for Swapl anytime in Settings → Passwords on this device.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .background(SwaplSemanticLight.background)
    }

    private var explainerCard: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 54, height: 54)
                .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text("Sign in without a password")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("A passkey uses Face ID or Touch ID and syncs with iCloud Keychain. It can't be phished or guessed.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private var successCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text("Passkey saved. Next time, pick \u{201C}Sign in with a passkey\u{201D} on the login screen.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private func addPasskey() {
        guard !isAdding else { return }
        isAdding = true
        error = nil
        Task {
            defer { isAdding = false }
            do {
                try await auth.addPasskey()
                addedThisSession += 1
            } catch PasskeyError.canceled {
                // User dismissed the system sheet — not an error.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
