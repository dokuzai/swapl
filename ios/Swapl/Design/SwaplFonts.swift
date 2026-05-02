import SwiftUI
import CoreText
import SwaplDesignTokens

// Registers the bundled Fraunces / Inter / JetBrains Mono TTFs at app launch.
// Drop the .ttf files in Resources/Fonts/ and list them under UIAppFonts in
// Info.plist; this helper logs missing entries for fast diagnosis.
enum SwaplFonts {
    static func register() {
        let names = [
            "Fraunces-Variable",
            "Fraunces-Italic-Variable",
            "Inter-Variable",
            "JetBrainsMono-Variable",
        ]
        for name in names {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else {
                print("[swapl-fonts] missing \(name).ttf in bundle")
                continue
            }
            var error: Unmanaged<CFError>?
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        }
    }
}

// Convenience text styles tuned to match the web's globals.css scale.
extension Font {
    static func swaplDisplay(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .custom(SwaplFontFamily.display, size: size).weight(weight)
    }
    static func swaplBody(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(SwaplFontFamily.body, size: size).weight(weight)
    }
    static func swaplMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(SwaplFontFamily.mono, size: size).weight(weight)
    }
    // Editorial labels used widely on the web (kicker, tag).
    static var swaplKicker: Font {
        .custom(SwaplFontFamily.mono, size: 11).weight(.medium)
    }
    static var swaplTag: Font {
        .custom(SwaplFontFamily.mono, size: 10).weight(.medium)
    }
}
