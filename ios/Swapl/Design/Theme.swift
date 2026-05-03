import SwiftUI
import SwaplDesignTokens

// Convenience accessors that flip between SwaplSemanticLight and Dark based
// on the current ColorScheme, so view code can write `theme.background`
// instead of branching itself.
struct SwaplTheme {
    let scheme: ColorScheme

    var background: Color { scheme == .dark ? SwaplSemanticDark.background : SwaplSemanticLight.background }
    var foreground: Color { scheme == .dark ? SwaplSemanticDark.foreground : SwaplSemanticLight.foreground }
    var card: Color { scheme == .dark ? SwaplSemanticDark.card : SwaplSemanticLight.card }
    var cardForeground: Color { scheme == .dark ? SwaplSemanticDark.cardForeground : SwaplSemanticLight.cardForeground }
    var primary: Color { scheme == .dark ? SwaplSemanticDark.primary : SwaplSemanticLight.primary }
    var primaryForeground: Color { scheme == .dark ? SwaplSemanticDark.primaryForeground : SwaplSemanticLight.primaryForeground }
    var muted: Color { scheme == .dark ? SwaplSemanticDark.muted : SwaplSemanticLight.muted }
    var mutedForeground: Color { scheme == .dark ? SwaplSemanticDark.mutedForeground : SwaplSemanticLight.mutedForeground }
    var accent: Color { scheme == .dark ? SwaplSemanticDark.accent : SwaplSemanticLight.accent }
    var accentForeground: Color { scheme == .dark ? SwaplSemanticDark.accentForeground : SwaplSemanticLight.accentForeground }
    var border: Color { scheme == .dark ? SwaplSemanticDark.border : SwaplSemanticLight.border }
    var ring: Color { scheme == .dark ? SwaplSemanticDark.ring : SwaplSemanticLight.ring }
    var destructive: Color { scheme == .dark ? SwaplSemanticDark.destructive : SwaplSemanticLight.destructive }
}

private struct SwaplThemeKey: EnvironmentKey {
    static let defaultValue = SwaplTheme(scheme: .light)
}

extension EnvironmentValues {
    var swaplTheme: SwaplTheme {
        get { self[SwaplThemeKey.self] }
        set { self[SwaplThemeKey.self] = newValue }
    }
}

struct SwaplThemeModifier: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.environment(\.swaplTheme, SwaplTheme(scheme: scheme))
    }
}

extension View {
    func swaplTheme() -> some View { modifier(SwaplThemeModifier()) }
}
