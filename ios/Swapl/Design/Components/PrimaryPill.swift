import SwiftUI
import SwaplDesignTokens

// Mirrors `.pill-primary` on the web: a fully-rounded pink call-to-action.
struct PrimaryPill: View {
    @Environment(\.swaplTheme) private var theme
    let title: String
    let action: () -> Void
    var isLoading: Bool = false
    var isDisabled: Bool = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: SwaplSpacing.s2) {
                if isLoading { ProgressView().tint(theme.primaryForeground) }
                Text(title)
                    .font(.swaplBody(15, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
                .padding(.horizontal, 24)
        }
        .background(theme.primary, in: Capsule())
        .foregroundStyle(theme.primaryForeground)
        .opacity(isDisabled ? 0.5 : 1)
        .disabled(isDisabled || isLoading)
    }
}

struct GhostPill: View {
    @Environment(\.swaplTheme) private var theme
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.swaplBody(15, weight: .medium))
                .padding(.vertical, 12)
                .padding(.horizontal, 24)
        }
        .overlay(Capsule().stroke(theme.foreground.opacity(0.18)))
        .foregroundStyle(theme.foreground)
    }
}
