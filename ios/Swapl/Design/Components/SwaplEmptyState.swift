import SwiftUI
import SwaplDesignTokens

// Branded replacement for ContentUnavailableView: SF Symbol in a soft circle,
// Fraunces title, Inter description, and an optional pill action styled like
// the app's primary CTA (see PrimaryPill).
struct SwaplEmptyState: View {
    let systemImage: String
    let title: String
    let description: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: systemImage)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .frame(width: 76, height: 76)
                .background(AirbnbPalette.softBackground, in: Circle())

            VStack(spacing: 8) {
                // Localize at render time: callers pass plain Strings (static UI
                // labels, sometimes dynamic server errors) and Text(String) is
                // verbatim. LocalizedStringKey looks each up in the catalog;
                // unknown keys (dynamic errors) render verbatim.
                Text(LocalizedStringKey(title))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(LocalizedStringKey(description))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .multilineTextAlignment(.center)

            if let actionTitle, let action {
                Button(action: action) {
                    Text(LocalizedStringKey(actionTitle))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                        .padding(.vertical, 14)
                        .padding(.horizontal, 28)
                }
                .background(SwaplSemanticLight.primary, in: Capsule())
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .padding(.top, 6)
            }
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity)
    }
}
