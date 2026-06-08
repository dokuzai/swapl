import SwiftUI
import Observation
import MapKit
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

enum BrowseViewMode { case list, map }

struct BrowseListView: View {
    @State private var vm = BrowseListViewModel()
    @State private var viewMode: BrowseViewMode = .list
    @State private var selectedMapId: String?

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
                    ZStack(alignment: .bottom) {
                        if viewMode == .map {
                            mapContent
                        } else {
                            exploreContent
                        }
                        floatingControls
                    }
                }
            }
            .background(SwaplSemanticLight.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                ListingDetailView(listingId: id)
            }
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var mapContent: some View {
        ZStack(alignment: .top) {
            BrowseMapView(items: vm.items, selectedId: $selectedMapId)
            mapTopFade
            mapSearchHeader
        }
    }

    @ViewBuilder
    private var floatingControls: some View {
        VStack(spacing: 12) {
            if viewMode == .map,
               let selected = vm.items.first(where: { $0.id == selectedMapId }) {
                mapSelectionCard(selected)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            viewModeToggle
        }
        .padding(.bottom, 24)
    }

    private var viewModeToggle: some View {
        Button {
            withAnimation(.snappy) {
                if viewMode == .list {
                    viewMode = .map
                } else {
                    viewMode = .list
                    selectedMapId = nil
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(viewMode == .list ? "Map" : "List")
                Image(systemName: viewMode == .list ? "map.fill" : "list.bullet")
            }
            .font(.subheadline)
            .fontWeight(.bold)
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(AirbnbPalette.text, in: Capsule())
            .shadow(color: .black.opacity(0.25), radius: 10, x: 0, y: 4)
        }
        .accessibilityLabel(viewMode == .list ? "Show map" : "Show list")
    }

    private func mapSelectionCard(_ item: ListingWithScore) -> some View {
        NavigationLink(value: item.listing.id) {
            HStack(spacing: 14) {
                ListingPhotoView(listing: item.listing, cornerRadius: 0)
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(item.listing.neighbourhood), \(item.listing.city)")
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text("\(item.listing.sleeps) guests · \(item.listing.bedrooms) beds")
                        .font(.caption)
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    if let score = item.matchScore {
                        Text("\(score)% match")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(AirbnbPalette.text)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(AirbnbPalette.softBackground, in: Capsule())
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 8)
            .padding(.horizontal, 22)
        }
        .buttonStyle(.plain)
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
        .background(SwaplSemanticLight.background)
    }

    private var searchBarContent: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Start your search")
                .font(.body)
                .fontWeight(.semibold)
            Spacer()
            Menu {
                sortButton("Best match", value: "match")
                sortButton("Newest", value: "newest")
                sortButton("Largest", value: "size_desc")
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(AirbnbPalette.text)
            }
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
    }

    // List mode: solid card search bar.
    private var searchHeader: some View {
        searchBarContent
            .background(SwaplSemanticLight.card, in: Capsule())
            .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
            .padding(.horizontal, 22)
            .padding(.top, 18)
    }

    // Map mode: floating Liquid Glass search bar (iOS 26) over the full-bleed map.
    private var mapSearchHeader: some View {
        searchBarContent
            .glassEffect(.regular, in: Capsule())
            .padding(.horizontal, 22)
            .padding(.top, 10)
    }

    // Soft fade so the map recedes behind the floating search bar and status bar.
    private var mapTopFade: some View {
        LinearGradient(
            colors: [SwaplSemanticLight.background, SwaplSemanticLight.background.opacity(0)],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 150)
        .frame(maxWidth: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
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
                .font(.caption)
                .fontWeight(.semibold)
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
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(2)
                    Text("\(item.listing.sleeps) guests")
                        .font(.subheadline)
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer()
                ListingPhotoView(listing: item.listing, cornerRadius: 0)
                    .frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            }
            .padding(22)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
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
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.body)
                    .fontWeight(.bold)
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
                // Round the FRAMED bounds. `.clipped()` here re-crops the
                // scaledToFill photo to a square rectangle, erasing the rounded
                // corners; clipShape on the framed size keeps them.
                ListingPhotoView(listing: item.listing, cornerRadius: 0)
                    .frame(width: cardWidth, height: imageHeight)
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))

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
        .background(SwaplSemanticLight.background)
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

// MARK: - Map

struct BrowseMapView: View {
    let items: [ListingWithScore]
    @Binding var selectedId: String?

    @State private var camera: MapCameraPosition = .automatic
    @State private var didFocus = false

    private var points: [ListingMapPoint] { items.map(ListingMapPoint.init) }

    var body: some View {
        Map(position: $camera) {
            ForEach(points) { point in
                Annotation(point.title, coordinate: point.coordinate) {
                    MapListingPin(point: point, selected: selectedId == point.id) {
                        withAnimation(.snappy) { selectedId = point.id }
                    }
                }
            }
            .annotationTitles(.hidden)
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapUserLocationButton() }
        .ignoresSafeArea()
        .onAppear(perform: focusInitial)
    }

    private func focusInitial() {
        guard !didFocus, let first = points.first else { return }
        didFocus = true
        camera = .region(
            MKCoordinateRegion(
                center: first.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.18, longitudeDelta: 0.18)
            )
        )
    }
}

struct MapListingPin: View {
    let point: ListingMapPoint
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if let score = point.matchScore {
                    Text("\(score)%")
                } else {
                    Image(systemName: "house.fill")
                }
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
            .foregroundStyle(selected ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(selected ? SwaplSemanticLight.primary : SwaplSemanticLight.card, in: Capsule())
            .overlay(
                Capsule().stroke(AirbnbPalette.hairline, lineWidth: selected ? 0 : 1)
            )
            .shadow(color: .black.opacity(0.18), radius: 6, x: 0, y: 2)
            .scaleEffect(selected ? 1.1 : 1)
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.25), value: selected)
    }
}

struct ListingMapPoint: Identifiable {
    let item: ListingWithScore

    var id: String { item.listing.id }
    var title: String { item.listing.title }
    var matchScore: Int? { item.matchScore }
    var coordinate: CLLocationCoordinate2D { ListingGeo.coordinate(for: item.listing) }
}

// Resolves a map coordinate for a listing. Uses the listing's own lat/lng when
// present; otherwise falls back to a known city centroid plus a small, stable
// per-listing offset so multiple homes in the same city don't stack exactly.
enum ListingGeo {
    static func coordinate(for listing: Listing) -> CLLocationCoordinate2D {
        if let lat = listing.lat, let lng = listing.lng {
            return CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
        let base = centroid(for: listing.city)
        let offset = jitter(for: listing.id)
        return CLLocationCoordinate2D(latitude: base.latitude + offset.lat,
                                      longitude: base.longitude + offset.lng)
    }

    private static func centroid(for city: String) -> CLLocationCoordinate2D {
        switch city {
        case "Amsterdam": return .init(latitude: 52.3676, longitude: 4.9041)
        case "Berlin":    return .init(latitude: 52.5200, longitude: 13.4050)
        case "Brooklyn":  return .init(latitude: 40.6782, longitude: -73.9442)
        case "CDMX":      return .init(latitude: 19.4326, longitude: -99.1332)
        case "Istanbul":  return .init(latitude: 41.0082, longitude: 28.9784)
        case "Lisbon":    return .init(latitude: 38.7223, longitude: -9.1393)
        case "Marrakesh": return .init(latitude: 31.6295, longitude: -7.9811)
        case "Paris":     return .init(latitude: 48.8566, longitude: 2.3522)
        case "Seoul":     return .init(latitude: 37.5665, longitude: 126.9780)
        case "Tokyo":     return .init(latitude: 35.6762, longitude: 139.6503)
        default:          return .init(latitude: 41.0082, longitude: 28.9784)
        }
    }

    // Deterministic FNV-1a hash so the same listing always lands in the same spot
    // (Swift's String.hashValue is randomized per launch and unsuitable here).
    private static func jitter(for id: String) -> (lat: Double, lng: Double) {
        var hash: UInt64 = 1469598103934665603
        for byte in id.utf8 { hash = (hash ^ UInt64(byte)) &* 1099511628211 }
        let dlat = (Double(hash % 1000) / 1000.0 - 0.5) * 0.06
        let dlng = (Double((hash / 1000) % 1000) / 1000.0 - 0.5) * 0.06
        return (dlat, dlng)
    }
}
