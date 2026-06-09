import SwiftUI
import SwaplDesignTokens

// Design system constants
enum SwaplDesignSystem {
    // Corner radii - increased for more rounded appearance
    enum CornerRadius {
        static let small: CGFloat = 12      // Small components (chips, badges)
        static let medium: CGFloat = 20     // Cards, tiles
        static let large: CGFloat = 28      // Featured cards, modals
        static let xLarge: CGFloat = 32     // Hero cards, large containers
    }
    
    // Typography scale - consistent font sizing
    enum FontSize {
        static let display: CGFloat = 40    // Page titles
        static let h1: CGFloat = 32         // Section headers
        static let h2: CGFloat = 24         // Subsection headers
        static let h3: CGFloat = 20         // Card titles
        static let body: CGFloat = 16       // Body text
        static let bodySmall: CGFloat = 15  // Secondary body text
        static let caption: CGFloat = 14    // Captions, metadata
        static let small: CGFloat = 13      // Small labels
        static let tiny: CGFloat = 11       // Badges, tags
    }
}

// Theme-aware color extensions - use environment colorScheme
extension EnvironmentValues {
    var accent: Color { colorScheme == .dark ? SwaplSemanticDark.accent : SwaplSemanticLight.accent }
    var textColor: Color { colorScheme == .dark ? SwaplSemanticDark.foreground : SwaplSemanticLight.foreground }
    var secondaryTextColor: Color { colorScheme == .dark ? SwaplSemanticDark.mutedForeground : SwaplSemanticLight.mutedForeground }
    var hairline: Color { colorScheme == .dark ? SwaplSemanticDark.border : SwaplSemanticLight.border }
    var softBg: Color { colorScheme == .dark ? SwaplSemanticDark.muted : SwaplSemanticLight.muted }
}

// Legacy compatibility - static colors (light mode only, for UIKit interop)
enum AirbnbPalette {
    static let background = SwaplSemanticLight.background
    static let card = SwaplSemanticLight.card
    /// Brand action color (pink #F24B8E) — CTAs, selected states, tint.
    static let primary = SwaplSemanticLight.primary
    static let primaryForeground = SwaplSemanticLight.primaryForeground
    /// Soft pink tint (#FDEEF5) — subtle backgrounds only, never as an action color.
    static let accent = SwaplSemanticLight.accent
    static let text = SwaplSemanticLight.foreground
    static let secondaryText = SwaplSemanticLight.mutedForeground
    static let hairline = SwaplSemanticLight.border
    static let softBackground = SwaplSemanticLight.muted
    static let destructive = SwaplSemanticLight.destructive
}

struct AirbnbChip: View {
    let title: String
    var selected = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let textColor = scheme == .dark ? SwaplSemanticDark.foreground : SwaplSemanticLight.foreground
        let bgColor = scheme == .dark ? SwaplSemanticDark.muted : SwaplSemanticLight.muted
        
        Text(title)
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(selected ? SwaplSemanticLight.primaryForeground : textColor)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(selected ? SwaplSemanticLight.primary : bgColor, in: Capsule())
    }
}

struct ListingPhotoView: View {
    let listing: Listing
    var cornerRadius: CGFloat = SwaplDesignSystem.CornerRadius.medium
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let softBg = scheme == .dark ? SwaplSemanticDark.muted : SwaplSemanticLight.muted
        
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        // Color.clear defines this view's size, so the scaledToFill image —
        // which overflows its frame — can't dictate the bounds. Clipping the
        // base to the rounded shape keeps corners rounded no matter how a
        // caller frames this view. (Without it, an outer `.frame().clipped()`
        // re-crops to a square rect and the rounding is silently lost.)
        Color.clear
            .overlay {
                Group {
                    if let url = preferredPhotoURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                            case .failure:
                                CityIllust(palette: SwaplCityPalettes.forName(listing.palette))
                            case .empty:
                                ZStack {
                                    softBg
                                    ProgressView()
                                }
                            @unknown default:
                                softBg
                            }
                        }
                    } else {
                        CityIllust(palette: SwaplCityPalettes.forName(listing.palette))
                    }
                }
            }
            .clipShape(shape)
            .contentShape(shape)
    }

    private var preferredPhotoURL: URL? {
        // Prefer the listing's own uploaded photos; fall back to curated stock
        // imagery (keyed stably by id) only when a listing has none yet.
        if let first = listing.photos.first(where: { !$0.isEmpty }), let url = URL(string: first) {
            return url
        }
        let curated = [
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
            "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200",
            "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200",
            "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200",
            "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1200"
        ]
        let index = abs(listing.id.hashValue) % curated.count
        return URL(string: curated[index])
    }
}

enum SwaplDateText {
    private static let apiFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let monthDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return formatter
    }()

    private static let monthDayYearFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("MMM d, yyyy")
        return formatter
    }()

    static func range(from rawFrom: String, to rawTo: String) -> String {
        guard let from = parse(rawFrom), let to = parse(rawTo) else {
            return "\(String(rawFrom.prefix(10))) - \(String(rawTo.prefix(10)))"
        }

        let calendar = Calendar.current
        if calendar.component(.year, from: from) == calendar.component(.year, from: to) {
            return "\(monthDayFormatter.string(from: from)) - \(monthDayYearFormatter.string(from: to))"
        }
        return "\(monthDayYearFormatter.string(from: from)) - \(monthDayYearFormatter.string(from: to))"
    }

    static func parse(_ value: String) -> Date? {
        let prefix = String(value.prefix(10))
        return apiFormatter.date(from: prefix) ?? ISO8601DateFormatter().date(from: value)
    }

    static func apiString(from date: Date) -> String {
        apiFormatter.string(from: date)
    }
}
