import SwiftUI
import Observation
import MapKit
import UIKit
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

    func apply(_ newFilters: SearchFilters) async {
        filters = newFilters
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

// Explore content chips, Airbnb-style: Homes keeps the listing search/filters,
// the other two swap in the affiliate Discover surfaces (DOK-145).
enum BrowseCategory: String, CaseIterable, Identifiable {
    case homes, experiences, services

    var id: String { rawValue }

    var title: String {
        switch self {
        case .homes: "Homes"
        case .experiences: "Experiences"
        case .services: "Services"
        }
    }

    // Preferred symbols with runtime fallback: "balloon" and "concierge.bell"
    // exist on modern SF Symbols releases but not everywhere we deploy.
    var icon: String {
        switch self {
        case .homes:
            return "house"
        case .experiences:
            return UIImage(systemName: "balloon") != nil ? "balloon" : "sparkles"
        case .services:
            return UIImage(systemName: "concierge.bell") != nil ? "concierge.bell" : "bell.fill"
        }
    }
}

struct BrowseListView: View {
    @State private var vm = BrowseListViewModel()
    @State private var viewMode: BrowseViewMode = .list
    @State private var selectedMapId: String?
    @State private var isShowingFilters = false
    @State private var category: BrowseCategory = .homes
    // "Get Inspired" (DOK-146): sheet + confirmed-proposal handoff. The thread
    // opens AFTER the sheet closes, through the existing deep-link route
    // (swapl://proposal/:id → ProposalDetailView in RootView).
    @State private var isShowingInspire = false
    @State private var confirmedProposalId: String?
    @Environment(\.openURL) private var openURL
    // Map search (DOK-182): MapKit autocomplete → recenter the browse map.
    @State private var locationSearch = LocationSearchService()
    @State private var mapSearchText = ""
    @State private var mapRecenterTarget: MapRecenterTarget?
    @FocusState private var mapSearchFocused: Bool

    var body: some View {
        NavigationStack {
            Group {
                switch category {
                case .homes:
                    homesRoot
                case .experiences:
                    discoverScaffold { ExperiencesView() }
                case .services:
                    discoverScaffold { ServicesView() }
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
            .sheet(isPresented: $isShowingFilters) {
                FilterSheetView(initialFilters: vm.filters) { newFilters in
                    Task { await vm.apply(newFilters) }
                }
                .presentationDetents([.large])
            }
            .sheet(isPresented: $isShowingInspire, onDismiss: {
                guard let id = confirmedProposalId else { return }
                confirmedProposalId = nil
                if let url = URL(string: "swapl://proposal/\(id)") { openURL(url) }
            }) {
                InspireView { proposalId in
                    confirmedProposalId = proposalId
                    isShowingInspire = false
                }
            }
        }
    }

    // Experiences/Services: page title + chips (no listing search), then the
    // selected Discover surface.
    private func discoverScaffold<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SwaplPageTitle("Explore")
                categoryStrip
                content()
            }
            .padding(.bottom, 110)
        }
        .background(SwaplSemanticLight.background)
    }

    // The Homes chip: the pre-existing Explore view, unchanged.
    @ViewBuilder
    private var homesRoot: some View {
            if vm.isLoading && !vm.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading homes")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Homes unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if vm.items.isEmpty {
                SwaplEmptyState(
                    systemImage: "house",
                    title: "No homes found",
                    description: "Try a different city, date range, or sort order.",
                    actionTitle: vm.filters.activeFilterCount > 0 ? "Adjust Filters" : "Refresh",
                    action: {
                        if vm.filters.activeFilterCount > 0 {
                            isShowingFilters = true
                        } else {
                            Task { await vm.load() }
                        }
                    }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    private var mapContent: some View {
        ZStack(alignment: .top) {
            BrowseMapView(items: vm.items, selectedId: $selectedMapId, searchRegion: $mapRecenterTarget)
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
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
            .foregroundStyle(SwaplSemanticLight.primaryForeground)
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
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text("\(item.listing.sleeps) guests · \(item.listing.bedrooms) beds")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    if let score = item.matchScore {
                        Text("\(score)% match")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
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
                SwaplPageTitle("Explore") { inspireButton }
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

    // Brand pill in the Explore header (Homes chip) — opens "Get Inspired".
    private var inspireButton: some View {
        Button {
            isShowingInspire = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                Text("Get Inspired")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
            }
            .foregroundStyle(SwaplSemanticLight.primaryForeground)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(SwaplSemanticLight.primary, in: Capsule())
        }
        .accessibilityLabel("Get Inspired, compose a swap package")
    }

    private var searchBarContent: some View {
        HStack(spacing: 12) {
            // The label area opens the filter sheet; the trailing menu keeps sort.
            Button {
                isShowingFilters = true
            } label: {
                HStack(spacing: 12) {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 20, weight: .semibold))
                        if vm.filters.activeFilterCount > 0 {
                            Text("\(vm.filters.activeFilterCount)")
                                .font(.swaplMono(11, weight: .bold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(SwaplSemanticLight.primary, in: Circle())
                                .offset(x: 11, y: -9)
                        }
                    }
                    Text(searchBarTitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                vm.filters.activeFilterCount > 0
                    ? "Search and filters, \(vm.filters.activeFilterCount) active"
                    : "Search and filters"
            )
            Menu {
                sortButton("Best match", value: "match")
                sortButton("Newest", value: "newest")
                sortButton("Largest", value: "size_desc")
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Sort homes")
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
    }

    private var searchBarTitle: String {
        if vm.filters.cities.isEmpty { return "Start your search" }
        return vm.filters.cities.joined(separator: ", ")
    }

    // List mode: solid card search bar.
    private var searchHeader: some View {
        searchBarContent
            .background(SwaplSemanticLight.card, in: Capsule())
            .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
            .padding(.horizontal, 22)
    }

    // Map mode: floating search bar over the full-bleed map — Liquid Glass on
    // iOS 26, card-on-capsule fallback on earlier releases (target is 17.0).
    // Typing here drives MapKit autocomplete (DOK-182); selecting a suggestion
    // recenters the camera and feeds the city back into the existing filters.
    private var mapSearchHeader: some View {
        VStack(spacing: 10) {
            Group {
                if #available(iOS 26.0, *) {
                    mapSearchBarContent
                        .glassEffect(.regular, in: Capsule())
                } else {
                    mapSearchBarContent
                        .background(SwaplSemanticLight.card, in: Capsule())
                        .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
                }
            }

            if mapSearchFocused && !locationSearch.suggestions.isEmpty {
                mapSuggestionsDropdown
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 10)
    }

    // Editable map search bar: filter badge + live location field + clear/loading
    // + sort. Mirrors `searchBarContent` styling so the capsule design is intact.
    private var mapSearchBarContent: some View {
        HStack(spacing: 12) {
            Button {
                isShowingFilters = true
            } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 20, weight: .semibold))
                    if vm.filters.activeFilterCount > 0 {
                        Text("\(vm.filters.activeFilterCount)")
                            .font(.swaplMono(11, weight: .bold))
                            .foregroundStyle(SwaplSemanticLight.primaryForeground)
                            .frame(minWidth: 17, minHeight: 17)
                            .background(SwaplSemanticLight.primary, in: Circle())
                            .offset(x: 11, y: -9)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                vm.filters.activeFilterCount > 0
                    ? "Filters, \(vm.filters.activeFilterCount) active"
                    : "Filters"
            )

            TextField("Search a city", text: $mapSearchText)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .focused($mapSearchFocused)
                .submitLabel(.search)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: 44)
                .onChange(of: mapSearchText) { _, newValue in
                    locationSearch.updateSearch(newValue)
                }
                .onSubmit {
                    Task {
                        if let region = await locationSearch.searchForText(mapSearchText) {
                            recenterMap(to: region, label: mapSearchText)
                        }
                    }
                }

            if locationSearch.isSearching {
                ProgressView()
                    .scaleEffect(0.8)
                    .frame(width: 28, height: 44)
            } else if !mapSearchText.isEmpty {
                Button {
                    mapSearchText = ""
                    locationSearch.clearSearch()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .frame(width: 28, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            } else {
                Menu {
                    sortButton("Best match", value: "match")
                    sortButton("Newest", value: "newest")
                    sortButton("Largest", value: "size_desc")
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 28, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Sort homes")
            }
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(.horizontal, 22)
        .padding(.vertical, 6)
    }

    // Suggestions dropdown, dressed in Swapl tokens (card + hairline + shadow).
    private var mapSuggestionsDropdown: some View {
        VStack(spacing: 0) {
            ForEach(Array(locationSearch.suggestions.prefix(5).enumerated()), id: \.offset) { index, suggestion in
                Button {
                    Task {
                        if let region = await locationSearch.selectSuggestion(suggestion) {
                            recenterMap(to: region, label: suggestion.title)
                        }
                    }
                } label: {
                    mapSuggestionRow(suggestion)
                }
                .buttonStyle(.plain)

                if index < min(locationSearch.suggestions.count, 5) - 1 {
                    Divider()
                        .overlay(AirbnbPalette.hairline)
                        .padding(.leading, 50)
                }
            }
        }
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func mapSuggestionRow(_ suggestion: MKLocalSearchCompletion) -> some View {
        HStack(spacing: 14) {
            Image(systemName: suggestionIcon(suggestion))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(suggestion.title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                if !suggestion.subtitle.isEmpty {
                    Text(suggestion.subtitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func suggestionIcon(_ suggestion: MKLocalSearchCompletion) -> String {
        let s = suggestion.subtitle.lowercased()
        if s.contains("restaurant") || s.contains("cafe") { return "fork.knife" }
        if s.contains("hotel") { return "bed.double" }
        if s.contains("airport") { return "airplane" }
        if s.contains("station") { return "tram" }
        if s.contains("school") || s.contains("university") { return "graduationcap" }
        if s.contains("park") { return "leaf" }
        return "mappin.circle"
    }

    // Recenter the camera and dismiss the dropdown. Also folds the searched place
    // into the existing city filter so pins/results stay coherent (DOK-182 §c):
    // a single-token title (a city, no comma) replaces the city filter.
    private func recenterMap(to region: MKCoordinateRegion, label: String) {
        mapRecenterTarget = MapRecenterTarget(region: region)
        mapSearchText = label
        mapSearchFocused = false

        let city = label.split(separator: ",").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? label
        if !city.isEmpty, vm.filters.cities != [city] {
            var newFilters = vm.filters
            newFilters.cities = [city]
            Task { await vm.apply(newFilters) }
        }
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

    // Pill chips under the search bar (Airbnb-style): selection swaps the
    // content below between Homes, Experiences and Services.
    private var categoryStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(BrowseCategory.allCases) { item in
                    categoryChip(item)
                }
            }
            .padding(.horizontal, 22)
        }
        .padding(.top, 2)
    }

    private func categoryChip(_ item: BrowseCategory) -> some View {
        let selected = category == item
        return Button {
            withAnimation(.snappy) { category = item }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: item.icon)
                    .font(.system(size: 15, weight: .semibold))
                Text(item.title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            }
            .foregroundStyle(selected ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .background(selected ? SwaplSemanticLight.primary : AirbnbPalette.softBackground, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.title)\(selected ? ", selected" : "")")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
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
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
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
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 42, height: 42)
                    .background(AirbnbPalette.softBackground, in: Circle())
                    .accessibilityHidden(true)
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

                FavoriteHeartButton(
                    listingId: item.listing.id,
                    size: compact ? 16 : SwaplDesignSystem.FontSize.h3
                )
                .padding(compact ? 0 : 2)

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
    // Externally-driven recenter target (set by the map search bar). Each new
    // region the search produces moves the camera; we track the live region so
    // panning/zooming stays in sync (guide §3.2/§3.3). Wrapped because
    // MKCoordinateRegion isn't Equatable — the id drives .onChange.
    @Binding var searchRegion: MapRecenterTarget?

    @State private var camera: MapCameraPosition = .automatic
    @State private var didFocus = false
    @State private var currentRegion: MKCoordinateRegion?

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
        .onMapCameraChange { context in
            currentRegion = context.region
        }
        .onChange(of: searchRegion?.id) { _, _ in
            guard let region = searchRegion?.region else { return }
            withAnimation(.easeInOut(duration: 0.5)) {
                camera = .region(region)
                currentRegion = region
            }
        }
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
        .accessibilityLabel(point.matchScore.map { "\(point.title), \($0) percent match" } ?? point.title)
    }
}

// Recenter command for BrowseMapView. MKCoordinateRegion isn't Equatable, so we
// carry a unique id per search result to drive the camera's .onChange.
struct MapRecenterTarget: Identifiable {
    let id = UUID()
    let region: MKCoordinateRegion
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
