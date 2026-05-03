import SwiftUI
import SwaplDesignTokens

enum AirbnbPalette {
    static let accent = Color(red: 1.0, green: 0.22, blue: 0.36)
    static let text = Color(red: 0.13, green: 0.13, blue: 0.13)
    static let secondaryText = Color(red: 0.43, green: 0.43, blue: 0.43)
    static let hairline = Color(red: 0.90, green: 0.90, blue: 0.90)
    static let softBackground = Color(red: 0.97, green: 0.97, blue: 0.97)
}

struct AirbnbChip: View {
    let title: String
    var selected = false

    var body: some View {
        Text(title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(selected ? .white : AirbnbPalette.text)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(selected ? AirbnbPalette.text : AirbnbPalette.softBackground, in: Capsule())
    }
}

struct ListingPhotoView: View {
    let listing: Listing
    var cornerRadius: CGFloat = 22

    var body: some View {
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
                            AirbnbPalette.softBackground
                            ProgressView()
                        }
                    @unknown default:
                        AirbnbPalette.softBackground
                    }
                }
            } else {
                CityIllust(palette: SwaplCityPalettes.forName(listing.palette))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var preferredPhotoURL: URL? {
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
