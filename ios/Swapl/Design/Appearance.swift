import SwiftUI

// User-selectable visual appearance (DOK-219).
//
// - `.swapl`: the brand identity — the warm cream canvas from the design system
//   (`SwaplSemanticLight.background`). This is the default and matches every
//   screenshot/marketing surface.
// - `.apple`: a neutral, native-iOS look — system "grouped" backgrounds and
//   white cards, the same palette Settings.app uses. It reads as a stock Apple
//   app rather than a branded one.
//
// The choice is persisted in `@AppStorage(SwaplAppearance.storageKey)`. The
// resolved colors live on `SwaplTheme` (see Theme.swift); views never branch on
// the appearance themselves — they read `theme.background` / use
// `.swaplScreenBackground()`.
//
// Note: both appearances currently render in Light mode. The app's content
// colors (text, cards, chips) are still hardcoded to `SwaplSemanticLight.*`, so
// letting `.apple` follow the system into Dark would leave navy text on a near
// black canvas. Honoring Dark is a deliberate follow-up that first needs those
// content colors routed through the theme.
enum SwaplAppearance: String, CaseIterable, Identifiable {
    case swapl
    case apple

    static let storageKey = "swapl.appearance"

    var id: String { rawValue }

    // Parses a persisted raw value, falling back to the brand default.
    static func resolve(_ raw: String) -> SwaplAppearance {
        SwaplAppearance(rawValue: raw) ?? .swapl
    }

    var title: String {
        switch self {
        case .swapl: String(localized: "Swapl")
        case .apple: String(localized: "Apple")
        }
    }

    var subtitle: String {
        switch self {
        case .swapl: String(localized: "Warm cream — the Swapl look")
        case .apple: String(localized: "Neutral, native iOS")
        }
    }

    var icon: String {
        switch self {
        case .swapl: "paintpalette.fill"
        case .apple: "apple.logo"
        }
    }
}
