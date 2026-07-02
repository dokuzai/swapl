import SwiftUI
import SwaplDesignTokens

// Convenience accessors that resolve semantic colors for the active appearance
// (DOK-219) — so view code can write `theme.background` instead of branching on
// the brand-vs-Apple choice itself.
//
// - `.swapl` returns the design-system tokens (cream canvas, white cards). It is
//   pinned to Light because the rest of the app's content colors are too.
// - `.apple` returns native system colors (`systemGroupedBackground`, etc.) so
//   the app reads like a stock iOS app. Resolved in Light for the same reason.
//
// `scheme` is retained for the day content colors are tokenized and Dark is
// honored; today both appearances render Light.
struct SwaplTheme {
    var appearance: SwaplAppearance = .swapl
    var scheme: ColorScheme = .light

    // The full-screen canvas behind cards and content.
    var background: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.background          // cream #FAF6E8
        case .apple: Color(.systemGroupedBackground)        // neutral grouped grey
        }
    }

    // Raised surfaces (list rows, cards, sheets) that sit on `background`.
    var card: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.card                // white
        case .apple: Color(.secondarySystemGroupedBackground)
        }
    }
    var cardForeground: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.cardForeground
        case .apple: Color(.label)
        }
    }

    var foreground: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.foreground
        case .apple: Color(.label)
        }
    }

    // Brand accent — pink reads as the app's identity in both looks (Apple apps
    // routinely keep a custom tint), so it doesn't go neutral.
    var primary: Color { SwaplSemanticLight.primary }
    var primaryForeground: Color { SwaplSemanticLight.primaryForeground }

    var muted: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.muted
        case .apple: Color(.secondarySystemFill)
        }
    }
    var mutedForeground: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.mutedForeground
        case .apple: Color(.secondaryLabel)
        }
    }

    var accent: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.accent
        case .apple: Color(.tertiarySystemFill)
        }
    }
    var accentForeground: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.accentForeground
        case .apple: Color(.label)
        }
    }

    var border: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.border
        case .apple: Color(.separator)
        }
    }
    var ring: Color { SwaplSemanticLight.ring }
    var destructive: Color {
        switch appearance {
        case .swapl: SwaplSemanticLight.destructive
        case .apple: Color(.systemRed)
        }
    }

    // The UIColor backing the tab/navigation bars — UIKit appearance proxies
    // need a UIColor, not a SwiftUI Color. `.apple` returns nil so the caller
    // configures a default (system) bar instead of tinting it.
    var barBackgroundUIColor: UIColor? {
        switch appearance {
        case .swapl: UIColor(SwaplSemanticLight.background)
        case .apple: nil
        }
    }
}

private struct SwaplThemeKey: EnvironmentKey {
    static let defaultValue = SwaplTheme()
}

extension EnvironmentValues {
    var swaplTheme: SwaplTheme {
        get { self[SwaplThemeKey.self] }
        set { self[SwaplThemeKey.self] = newValue }
    }
}

// Reads the persisted appearance and injects the resolved theme into the
// environment for the whole subtree. Apply once near the app root.
struct SwaplThemeModifier: ViewModifier {
    @AppStorage(SwaplAppearance.storageKey) private var appearanceRaw = SwaplAppearance.swapl.rawValue
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let appearance = SwaplAppearance.resolve(appearanceRaw)
        content.environment(\.swaplTheme, SwaplTheme(appearance: appearance, scheme: scheme))
    }
}

extension View {
    func swaplTheme() -> some View { modifier(SwaplThemeModifier()) }
}

// The one way screens paint their background (DOK-219). Hiding the scroll
// content background lets the theme canvas show through List/Form screens (which
// otherwise keep their opaque system-grouped background), so every page —
// scrolling or not — shares the same cream (or Apple-neutral) canvas. White
// grouped rows still sit on top, exactly as the design intends.
struct SwaplScreenBackground: ViewModifier {
    @Environment(\.swaplTheme) private var theme

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(theme.background.ignoresSafeArea())
    }
}

extension View {
    func swaplScreenBackground() -> some View { modifier(SwaplScreenBackground()) }
}
