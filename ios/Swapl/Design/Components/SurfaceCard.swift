import SwiftUI
import SwaplDesignTokens

// Mirrors `.surface-card` on the web — white card with line border and a
// subtle hover shadow we approximate with a static drop shadow.
struct SurfaceCard<Content: View>: View {
    @Environment(\.swaplTheme) private var theme
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(SwaplSpacing.s5)
            .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplRadius.lg)
                    .stroke(theme.border)
            )
            .shadow(color: SwaplColor.navy.opacity(0.08), radius: 24, x: 0, y: 12)
    }
}

struct TagChip: View {
    let label: String
    var body: some View {
        Text(label.uppercased())
            .font(.swaplTag)
            .tracking(0.06 * 10)
            .foregroundStyle(SwaplColor.navy)
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(SwaplColor.tagBg, in: RoundedRectangle(cornerRadius: 4))
    }
}

struct MatchBadge: View {
    @Environment(\.swaplTheme) private var theme
    let percent: Int
    var body: some View {
        Text("\(percent)% MATCH")
            .font(.swaplMono(11, weight: .medium))
            .tracking(0.08 * 11)
            .foregroundStyle(theme.primaryForeground)
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(theme.primary, in: Capsule())
    }
}

struct KickerLabel: View {
    let text: String
    var body: some View {
        Text("§ " + text.uppercased())
            .font(.swaplKicker)
            .tracking(0.14 * 11)
            .foregroundStyle(SwaplColor.pink)
    }
}
