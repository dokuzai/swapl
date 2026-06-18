import Foundation
import Observation

// UserDefaults key for the in-app language marker. Read by APIClient for the
// Accept-Language header. The UI language itself is driven by the per-app
// "AppleLanguages" override, which iOS reads once at launch — so a language
// change applies the next time the app is opened (String(localized:) and the
// String Catalog can't be re-pointed reliably at runtime).
let swaplAppLanguageDefaultsKey = "swapl.appLanguage"

@MainActor
@Observable
final class LanguageManager {
    static let shared = LanguageManager()

    // Must match the String Catalog locales / project.yml knownRegions.
    static let supported = ["en", "it", "fr", "es", "ar", "ar-PS", "fa", "el", "ro", "tr", "id", "th", "zh", "ja"]

    // The language the app is currently running in (fixed at launch).
    let activeCode: String
    // The user's current selection — differs from activeCode until the app is
    // reopened.
    private(set) var selectedCode: String

    private init() {
        let stored = UserDefaults.standard.string(forKey: swaplAppLanguageDefaultsKey)
        let system = UserDefaults.standard.stringArray(forKey: "AppleLanguages")?.first
            ?? Locale.preferredLanguages.first ?? "en"
        let resolved = Self.normalize(stored ?? system)
        activeCode = resolved
        selectedCode = resolved
    }

    var needsRestart: Bool { selectedCode != activeCode }

    // Persist the chosen language. Applies on the next launch (the per-app
    // AppleLanguages override is how iOS Settings' per-app language works too).
    func select(_ code: String) {
        selectedCode = code
        UserDefaults.standard.set(code, forKey: swaplAppLanguageDefaultsKey)
        UserDefaults.standard.set([code], forKey: "AppleLanguages")
    }

    static func normalize(_ identifier: String) -> String {
        if supported.contains(identifier) { return identifier }
        let base = String(identifier.prefix(2))
        return supported.contains(base) ? base : "en"
    }

    // Each language shown in its own language ("Italiano", "العربية (فلسطين)"…).
    func displayName(_ code: String) -> String {
        let loc = Locale(identifier: code)
        let langCode = loc.language.languageCode?.identifier ?? code
        var name = (loc.localizedString(forLanguageCode: langCode) ?? code).localizedCapitalized
        if let region = loc.region?.identifier, let regionName = loc.localizedString(forRegionCode: region) {
            name += " (\(regionName))"
        }
        return name
    }
}
