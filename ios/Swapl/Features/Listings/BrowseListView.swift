import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class BrowseListViewModel {
    var items: [ListingWithScore] = []
    var isLoading = false
    var error: String?
    var filters = SearchFilters()

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let res = try await ListingRepository.shared.search(filters: filters)
            items = res.items
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BrowseListView: View {
    @State private var vm = BrowseListViewModel()
    @State private var path: [String] = []
    @State private var showCreate = false
    @Environment(AppRouter.self) private var router

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(spacing: SwaplSpacing.s4) {
                    ForEach(vm.items) { item in
                        NavigationLink(value: item.listing.id) {
                            ListingCardView(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(SwaplSpacing.s4)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle("Browse")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(SwaplColor.pink)
                    }
                }
            }
            .navigationDestination(for: String.self) { id in
                ListingDetailView(listingId: id)
            }
            .task { await vm.load() }
            .refreshable { await vm.load() }
            .onAppear { consumePendingDeepLink() }
            .onChange(of: router.pendingDestination) { _, _ in consumePendingDeepLink() }
            .sheet(isPresented: $showCreate, onDismiss: { Task { await vm.load() } }) {
                ListingCreateView()
            }
        }
        .swaplTheme()
    }

    private func consumePendingDeepLink() {
        guard router.selectedTab == .browse else { return }
        if case let .listing(id) = router.pendingDestination {
            path = [id]
            router.pendingDestination = nil
        }
    }
}

struct ListingCardView: View {
    let item: ListingWithScore

    var body: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                CityIllust(palette: SwaplCityPalettes.forName(item.listing.palette))
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(item.listing.neighbourhood) · \(item.listing.city)")
                            .font(.swaplDisplay(20))
                            .foregroundStyle(SwaplSemanticLight.foreground)
                        Text("\(item.listing.sleeps) guests · \(item.listing.sizeSqm) m² · \(item.listing.propertyType.lowercased())")
                            .font(.swaplBody(13))
                            .foregroundStyle(SwaplSemanticLight.mutedForeground)
                    }
                    Spacer()
                    if let score = item.matchScore {
                        MatchBadge(percent: score)
                    } else if item.band == "featured" {
                        TagChip(label: "Featured")
                    } else if item.band == "verified" {
                        TagChip(label: "Verified")
                    }
                }
            }
        }
    }
}
