import SwiftUI
import Observation
import SwaplDesignTokens

// Experiences tab of Explore (DOK-145): big Airbnb-style cards backed by
// GET /api/discover/experiences. Affiliate links only — no prices, no
// availability. Env-gated server-side: zero configured partners → clean
// empty state.
@MainActor
@Observable
final class ExperiencesViewModel {
    var items: [DiscoverExperience] = []
    var isLoading = false
    var error: String?
    var hasLoaded = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            items = try await DiscoverRepository.shared.experiences()
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }
}

// Renders inside Explore's outer ScrollView — no nested scrolling here.
struct ExperiencesView: View {
    @State private var vm = ExperiencesViewModel()
    @State private var safariItem: SafariItem?

    var body: some View {
        Group {
            if vm.isLoading && !vm.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 280)
                    .accessibilityLabel("Loading experiences")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Experiences unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, minHeight: 280)
            } else if vm.items.isEmpty {
                SwaplEmptyState(
                    systemImage: "sparkles",
                    title: "No experiences yet",
                    description: "City experiences are coming soon. Check back here before your next swap."
                )
                .frame(maxWidth: .infinity, minHeight: 280)
            } else {
                LazyVStack(alignment: .leading, spacing: 28) {
                    ForEach(vm.items) { item in
                        ExperienceCardView(item: item) {
                            if let url = DiscoverRepository.resolveURL(item.url) {
                                safariItem = SafariItem(url: url)
                            }
                        }
                    }
                }
                .padding(.horizontal, 22)
            }
        }
        .task { await vm.load() }
        .sheet(item: $safariItem) { item in
            SafariView(url: item.url)
                .ignoresSafeArea()
        }
    }
}

struct ExperienceCardView: View {
    let item: DiscoverExperience
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                photo
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title)
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(locationText)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                    HStack(spacing: 5) {
                        Text("Book on \(item.partnerDisplayName)")
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 11, weight: .bold))
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.top, 2)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.title), book on \(item.partnerDisplayName)")
    }

    private var locationText: String {
        item.country.isEmpty ? item.city : "\(item.city), \(item.country)"
    }

    // City photo from the CityMedia cache; no cached photo → the brand city
    // illustration (same fallback the listing cards use). The partner badge
    // floats over the image, Airbnb "Guest favorite"-style.
    private var photo: some View {
        let shape = RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
        return Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: 220)
            .overlay {
                if let raw = item.photo?.url, let url = URL(string: raw) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            fallbackIllust
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
                    fallbackIllust
                }
            }
            .overlay(alignment: .topLeading) {
                Text(item.partnerDisplayName)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(.white, in: Capsule())
                    .padding(12)
            }
            .clipShape(shape)
            .contentShape(shape)
    }

    private var fallbackIllust: some View {
        let palette = Self.palette(for: item.city)
        // The illustration letterboxes (fixed 200×140 aspect); matching the
        // sky color behind it keeps the card looking intentional.
        return ZStack {
            palette.sky
            CityIllust(palette: palette)
        }
    }

    // Stable per-city palette pick — FNV-1a, because String.hashValue is
    // randomized per launch and would re-color cities on every cold start.
    private static func palette(for city: String) -> SwaplCityPalette {
        let names = ["warm", "cool", "rose", "sage", "dusk", "sand", "mono"]
        var hash: UInt64 = 1469598103934665603
        for byte in city.lowercased().utf8 { hash = (hash ^ UInt64(byte)) &* 1099511628211 }
        return SwaplCityPalettes.forName(names[Int(hash % UInt64(names.count))])
    }
}
