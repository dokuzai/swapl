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

    private let columns = [
        GridItem(.flexible(), spacing: 18, alignment: .top),
        GridItem(.flexible(), spacing: 18, alignment: .top)
    ]

    var body: some View {
        NavigationStack {
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
        }
    }

    // Hide homes un-hearted since the last fetch so the tab tracks the shared
    // store without a refetch on every toggle.
    private var visibleItems: [Listing] {
        vm.items.filter { favorites.isFavorite($0.id) }
    }

    private var grid: some View {
        ScrollView {
            Text("Wishlists")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.display, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 22)
                .padding(.top, 22)
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
