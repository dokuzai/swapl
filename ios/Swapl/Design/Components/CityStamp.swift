import SwiftUI
import SwaplDesignTokens

// Postcard city stamp — SwiftUI port of components/profile/city-stamp.tsx,
// the same visual language as the stamp in the corner of the browse-card
// postcards: cream paper, thin navy frame, inner dashed border, monospace
// uppercase city. Used on the public profile's "Where I've been" strip, one
// stamp per visited city + year (from COMPLETED agreements — real data only).
struct CityStamp: View {
    let city: String
    let country: String
    let year: Int
    var tilt: Double = 0

    // Stamp paper is intentionally a touch whiter than the cream background
    // (#FFFBF3, matching the web component) so it reads as a pasted sticker.
    private static let paper = Color(red: 255 / 255, green: 251 / 255, blue: 243 / 255)

    var body: some View {
        VStack(spacing: 2) {
            Text(String(city.prefix(14)).uppercased())
                .font(.swaplMono(11, weight: .bold))
                .tracking(0.14 * 11)
                .foregroundStyle(SwaplColor.navy)
            Text("\(String(country.prefix(14)).uppercased()) · \(String(year))")
                .font(.swaplMono(9))
                .tracking(0.12 * 9)
                .foregroundStyle(SwaplColor.navy3)
        }
        .lineLimit(1)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minWidth: 120)
        .overlay(
            RoundedRectangle(cornerRadius: 2)
                .stroke(SwaplColor.navy3, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        )
        .padding(4)
        .background(Self.paper, in: RoundedRectangle(cornerRadius: 4))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(SwaplColor.navy, lineWidth: 1)
        )
        .background(
            // The web's hard offset shadow (2px 2px 0, navy 12%).
            RoundedRectangle(cornerRadius: 4)
                .fill(SwaplColor.navy.opacity(0.12))
                .offset(x: 2, y: 2)
        )
        .rotationEffect(.degrees(tilt))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(city), \(country), \(year)")
    }
}

// Horizontal "Where I've been" strip: stamps scroll sideways with a slight
// alternating tilt, like stamps inked onto a passport page.
struct CityStampStrip: View {
    let visited: [PublicProfile.VisitedCity]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SwaplSpacing.s3) {
                ForEach(Array(visited.enumerated()), id: \.element) { index, stop in
                    CityStamp(
                        city: stop.city,
                        country: stop.country,
                        year: stop.year,
                        tilt: index.isMultiple(of: 2) ? -2 : 1.5
                    )
                }
            }
            // Vertical breathing room so tilted corners don't clip.
            .padding(.vertical, 6)
            .padding(.horizontal, 2)
        }
    }
}
