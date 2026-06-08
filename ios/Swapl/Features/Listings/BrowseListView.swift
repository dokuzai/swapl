import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class BrowseListViewModel {
    var items: [ListingWithScore] = []
    var isLoading = false
    var error: String?
    var filters = SearchFilters()
    var hasLoaded = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let res = try await ListingRepository.shared.search(filters: filters)
            items = res.items
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }

    func setSort(_ sort: String) async {
        filters.sort = sort
        await load()
    }

    var sortTitle: String {
        switch filters.sort {
        case "newest": "Newest"
        case "size_desc": "Largest"
        default: "Best match"
        }
    }
}

struct BrowseListView: View {
    @State private var vm = BrowseListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading homes")
                } else if let error = vm.error {
                    ContentUnavailableView {
                        Label("Homes unavailable", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await vm.load() } }
                    }
                } else if vm.items.isEmpty {
                    ContentUnavailableView {
                        Label("No homes found", systemImage: "house")
                    } description: {
                        Text("Try a different city, date range, or sort order.")
                    } actions: {
                        Button("Refresh") { Task { await vm.load() } }
                    }
                } else {
                    exploreContent
                }
            }
            .background(AirbnbPalette.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                ListingDetailView(listingId: id)
            }
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var exploreContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                searchHeader
                categoryStrip
                if let first = vm.items.first {
                    continueCard(first)
                }
                listingSection(title: "Homes guests love", items: Array(vm.items.prefix(6)), compact: true)
                listingSection(title: "Available for similar dates", items: Array(vm.items.dropFirst(3).prefix(6)), compact: false)
            }
            .padding(.bottom, 110)
        }
        .background(AirbnbPalette.background)
    }

    private var searchHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: SwaplDesignSystem.FontSize.h3, weight: .semibold))
            Text("Start your search")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
            Spacer()
            Menu {
                sortButton("Best match", value: "match")
                sortButton("Newest", value: "newest")
                sortButton("Largest", value: "size_desc")
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
            }
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
        .background(AirbnbPalette.card, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 22)
        .padding(.top, 18)
    }

    private var categoryStrip: some View {
        HStack(spacing: 34) {
            category(icon: "house.fill", title: "Homes", selected: true)
            category(icon: "sparkles", title: "Experiences", selected: false)
            category(icon: "bell.fill", title: "Services", selected: false)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    private func category(icon: String, title: String, selected: Bool) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .regular))
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
            Rectangle()
                .fill(selected ? AirbnbPalette.text : .clear)
                .frame(width: 42, height: 3)
                .clipShape(Capsule())
        }
        .foregroundStyle(selected ? AirbnbPalette.text : AirbnbPalette.secondaryText)
    }

    private func continueCard(_ item: ListingWithScore) -> some View {
        NavigationLink(value: item.listing.id) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Continue planning your \(item.listing.city) swap")
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(2)
                    Text("\(item.listing.sleeps) guests")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .regular))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer()
                ListingPhotoView(listing: item.listing, cornerRadius: SwaplDesignSystem.CornerRadius.medium)
                    .frame(width: 92, height: 92)
            }
            .padding(22)
            .background(AirbnbPalette.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .shadow(color: .black.opacity(0.06), radius: 18, x: 0, y: 10)
            .padding(.horizontal, 22)
        }
        .buttonStyle(.plain)
    }

    private func listingSection(title: String, items: [ListingWithScore], compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 42, height: 42)
                    .background(AirbnbPalette.softBackground, in: Circle())
            }
            .padding(.horizontal, 22)

            if compact {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(items.prefix(3))) { item in
                        NavigationLink(value: item.listing.id) {
                            ListingCardView(item: item, compact: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 22)
                .frame(height: 156, alignment: .top)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(items) { item in
                            NavigationLink(value: item.listing.id) {
                                ListingCardView(item: item, compact: false)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 22)
                    .frame(height: 292, alignment: .top)
                }
            }
        }
    }

    private func sortButton(_ title: String, value: String) -> some View {
        Button {
            Task { await vm.setSort(value) }
        } label: {
            if vm.filters.sort == value {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }
}

struct ListingCardView: View {
    let item: ListingWithScore
    var compact = false

    private var cardWidth: CGFloat { compact ? 100 : 214 }
    private var imageHeight: CGFloat { compact ? 96 : 214 }
    private var cornerRadius: CGFloat { compact ? SwaplDesignSystem.CornerRadius.medium : SwaplDesignSystem.CornerRadius.large }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 7 : 9) {
            ZStack(alignment: .topTrailing) {
                ListingPhotoView(listing: item.listing, cornerRadius: cornerRadius)
                    .frame(width: cardWidth, height: imageHeight)
                    .clipped()

                Image(systemName: "heart")
                    .font(.system(size: compact ? 18 : SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 1)
                    .padding(compact ? 9 : 12)

                if !compact && (item.band == "featured" || item.matchScore != nil) {
                    Text(item.matchScore.map { "\($0)% match" } ?? "Guest favorite")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.white, in: Capsule())
                        .padding(10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }

            Text(primaryLocation)
                .font(.swaplBody(compact ? SwaplDesignSystem.FontSize.small : SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
                .padding(.top, compact ? 3 : 0)
            Text(compact ? "\(item.listing.bedrooms) beds · \(ratingText)" : "\(item.listing.sleeps) guests · \(item.listing.bedrooms) beds")
                .font(.swaplBody(compact ? SwaplDesignSystem.FontSize.small : SwaplDesignSystem.FontSize.caption, weight: .regular))
                .foregroundStyle(AirbnbPalette.secondaryText)
            Text("Available \(SwaplDateText.range(from: item.listing.availableFrom, to: item.listing.availableTo))")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .regular))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .lineLimit(1)
                .opacity(compact ? 0 : 1)
                .frame(height: compact ? 0 : nil)
        }
        .frame(width: cardWidth, alignment: .leading)
        .background(AirbnbPalette.background)
    }

    private var ratingText: String {
        if let score = item.matchScore {
            return String(format: "%.2f", max(4.5, Double(score) / 20))
        }
        return "4.8"
    }

    private var primaryLocation: String {
        compact ? "\(item.listing.city), \(compactCountry)" : "\(item.listing.neighbourhood), \(item.listing.city)"
    }

    private var compactCountry: String {
        let country = item.listing.country
        let codes = [
            "South Korea": "KR",
            "United States": "US",
            "USA": "US",
            "Germany": "DE",
            "Turkey": "TR",
            "Türkiye": "TR",
            "Mexico": "MX",
            "Netherlands": "NL",
            "Greece": "GR",
            "Lebanon": "LB"
        ]
        return codes[country] ?? country
    }
}
