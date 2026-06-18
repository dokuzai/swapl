import SwiftUI
import SwaplDesignTokens

// In-app language picker. iOS applies a per-app language only at launch, so the
// choice is persisted (AppleLanguages override) and takes effect when the app
// is reopened — we offer a one-tap restart.
struct LanguagePickerView: View {
    @Environment(LanguageManager.self) private var lang
    @State private var confirmRestart = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if lang.needsRestart {
                    restartBanner
                }
                ForEach(LanguageManager.supported, id: \.self) { code in
                    Button {
                        lang.select(code)
                        if lang.needsRestart { confirmRestart = true }
                    } label: {
                        row(code)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .swaplFloatingHeader(String(localized: "Language"))
        .alert(String(localized: "Reopen to apply"), isPresented: $confirmRestart) {
            Button(String(localized: "Restart now"), role: .destructive) { exit(0) }
            Button(String(localized: "Later"), role: .cancel) {}
        } message: {
            Text("Swapl switches to \(lang.displayName(lang.selectedCode)) when you reopen it.")
        }
    }

    private func row(_ code: String) -> some View {
        HStack(spacing: 14) {
            Text(lang.displayName(code))
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer(minLength: 8)
            if lang.selectedCode == code {
                Image(systemName: "checkmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private var restartBanner: some View {
        Button { confirmRestart = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .semibold))
                Text("Reopen Swapl to finish switching to \(lang.displayName(lang.selectedCode)).")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundStyle(SwaplSemanticLight.primary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
