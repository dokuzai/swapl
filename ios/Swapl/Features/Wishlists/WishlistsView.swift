import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class WishlistsViewModel {
    var items: [Listing] = []
    var error: String?
    var isLoading = false
    var hasLoaded = false

    // Wishlist ordering + an optional availability-period filter.
    enum SortOption: String, CaseIterable {
        case country, city, feedback, availableToday
    }
    var sortBy: SortOption = .country
    var filterStart: Date?
    var filterEnd: Date?
    var hasDateFilter: Bool { filterStart != nil && filterEnd != nil }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            items = try await FavoritesRepository.shared.list().items
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }
}

// Saved homes (favorites). Reuses the browse listing cards in a two-column
// grid; hearts come from the shared FavoritesStore so unfavoriting here is
// reflected on browse and detail too.
struct WishlistsView: View {
    @Environment(FavoritesStore.self) private var favorites
    @State private var vm = WishlistsViewModel()
    @State private var showDateFilter = false

    private let columns = [
        GridItem(.flexible(), spacing: 18, alignment: .top),
        GridItem(.flexible(), spacing: 18, alignment: .top)
    ]

    var body: some View {
        NavigationStack {
            // Title lives outside the state switch so it is visible in the
            // loading / error / empty states too, matching the other tabs.
            VStack(spacing: 0) {
                SwaplPageTitle("Wishlists") {
                    if !vm.items.isEmpty { titleFilters }
                }
                stateContent
            }
            .background(SwaplSemanticLight.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                ListingDetailView(listingId: id)
            }
            .task { await vm.load() }
            .refreshable {
                await favorites.reloadIds()
                await vm.load()
            }
            .sheet(isPresented: $showDateFilter) { dateFilterSheet }
        }
    }

    @ViewBuilder
    private var stateContent: some View {
        Group {
            if vm.isLoading && !vm.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading saved homes")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Wishlists unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleItems.isEmpty {
                SwaplEmptyState(
                    systemImage: "heart",
                    title: "No saved homes yet",
                    description: "Tap the heart on any home to save it here."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                grid
            }
        }
    }

    // Saved homes still hearted, narrowed by the date filter and ordered by the
    // chosen sort.
    private var visibleItems: [Listing] {
        var list = vm.items.filter { favorites.isFavorite($0.id) }

        // Date filter: keep homes whose availability window covers the period.
        if let start = vm.filterStart, let end = vm.filterEnd {
            list = list.filter { listing in
                guard let from = SwaplDateText.parse(listing.availableFrom),
                      let to = SwaplDateText.parse(listing.availableTo) else { return false }
                return from <= start && to >= end
            }
        }

        switch vm.sortBy {
        case .country:
            list.sort { ($0.country, $0.city) < ($1.country, $1.city) }
        case .city:
            list.sort { ($0.city, $0.country) < ($1.city, $1.country) }
        case .feedback:
            list.sort { ($0.hostRating ?? -1) > ($1.hostRating ?? -1) }
        case .availableToday:
            list.sort { (freeToday($0) ? 0 : 1, $0.city) < (freeToday($1) ? 0 : 1, $1.city) }
        }
        return list
    }

    private func freeToday(_ listing: Listing) -> Bool {
        guard let from = SwaplDateText.parse(listing.availableFrom),
              let to = SwaplDateText.parse(listing.availableTo) else { return false }
        let today = Date()
        return from <= today && to >= today
    }

    private func sortLabel(_ option: WishlistsViewModel.SortOption) -> String {
        switch option {
        case .country: return String(localized: "Country")
        case .city: return String(localized: "City")
        case .feedback: return String(localized: "Feedback")
        case .availableToday: return String(localized: "Free today")
        }
    }

    // Compact filters that sit inline with the page title (glass icon buttons,
    // so they always fit the title row regardless of width).
    private var titleFilters: some View {
        HStack(spacing: 8) {
            Menu {
                Picker(String(localized: "Order by"), selection: Bindable(vm).sortBy) {
                    ForEach(WishlistsViewModel.SortOption.allCases, id: \.self) { opt in
                        Text(sortLabel(opt)).tag(opt)
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 40, height: 40)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel(Text("Order by"))

            Button { showDateFilter = true } label: {
                Image(systemName: "calendar")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 40, height: 40)
                    .glassEffect(.regular.interactive(), in: .circle)
                    .overlay(alignment: .topTrailing) {
                        if vm.hasDateFilter {
                            Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                        }
                    }
            }
            .accessibilityLabel(Text("Filter by dates"))
        }
    }

    @State private var draftStart = Date()
    @State private var draftEnd = Date().addingTimeInterval(60 * 60 * 24 * 7)

    private var dateFilterSheet: some View {
        NavigationStack {
            Form {
                DatePicker(String(localized: "From"), selection: $draftStart, displayedComponents: .date)
                DatePicker(String(localized: "To"), selection: $draftEnd, in: draftStart..., displayedComponents: .date)
            }
            .navigationTitle(String(localized: "Filter by dates"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Clear")) {
                        vm.filterStart = nil; vm.filterEnd = nil; showDateFilter = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Apply")) {
                        vm.filterStart = draftStart; vm.filterEnd = draftEnd; showDateFilter = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func isoDay(_ date: Date?) -> String {
        guard let date else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 24) {
                ForEach(visibleItems) { listing in
                    NavigationLink(value: listing.id) {
                        WishlistCardView(listing: listing)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
    }
}

// A width-flexible variant of the browse card for the wishlist grid.
struct WishlistCardView: View {
    let listing: Listing
    @Environment(FavoritesStore.self) private var favorites

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { ListingPhotoView(listing: listing, cornerRadius: 0) }
                    .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))

                FavoriteHeartButton(listingId: listing.id, size: 20)
                    .padding(6)
            }

            Text("\(listing.neighbourhood), \(listing.city)")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
            Text("\(listing.sleeps) guests · \(listing.bedrooms) beds")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                .foregroundStyle(AirbnbPalette.secondaryText)
            Text("Available \(SwaplDateText.range(from: listing.availableFrom, to: listing.availableTo))")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .lineLimit(1)
        }
    }
}

// Shared heart toggle used on browse cards, wishlist cards and listing detail.
// Reads/writes the session FavoritesStore (optimistic, rolls back on error).
struct FavoriteHeartButton: View {
    let listingId: String
    var size: CGFloat = 18
    // White reads well over photos; pass AirbnbPalette.text for light surfaces.
    var unfilledColor: Color = .white
    var showsShadow = true

    @Environment(FavoritesStore.self) private var favorites

    var body: some View {
        let isFavorite = favorites.isFavorite(listingId)
        Button {
            favorites.toggle(listingId)
        } label: {
            Image(systemName: isFavorite ? "heart.fill" : "heart")
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(isFavorite ? SwaplSemanticLight.primary : unfilledColor)
                .shadow(color: .black.opacity(showsShadow ? 0.35 : 0), radius: 4, x: 0, y: 1)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFavorite ? "Remove from wishlist" : "Save to wishlist")
        .animation(.snappy(duration: 0.2), value: isFavorite)
    }
}
