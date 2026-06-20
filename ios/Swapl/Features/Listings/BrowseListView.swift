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
        case "newest": String(localized: "Newest")
        case "size_desc": String(localized: "Largest")
        default: String(localized: "Best match")
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
        case .homes: String(localized: "Homes")
        case .experiences: String(localized: "Experiences")
        case .services: String(localized: "Services")
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
    // Search composer (Where/When/Who + pets) vs the top "more filters" pill (DOK-216).
    @State private var isShowingSearch = false
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
    // Cross-view jump to the map for a city (set by the listing-detail city pill, DOK-216).
    @State private var exploreRouter = ExploreRouter.shared

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
            // A tapped city pill on the listing detail jumps here: show the map
            // centered on that city (DOK-216).
            .onChange(of: exploreRouter.pendingMapCity) { _, city in
                guard let city else { return }
                exploreRouter.pendingMapCity = nil
                category = .homes
                withAnimation(.snappy) { viewMode = .map }
                Task {
                    if let region = await locationSearch.searchForText(city) {
                        recenterMap(to: region, label: city)
                    } else {
                        var f = vm.filters
                        f.cities = [city]
                        await vm.apply(f)
                    }
                }
            }
            .sheet(isPresented: $isShowingFilters) {
                FilterSheetView(initialFilters: vm.filters, scope: .more) { newFilters in
                    Task { await vm.apply(newFilters) }
                }
                .presentationDetents([.large])
            }
            .sheet(isPresented: $isShowingSearch) {
                FilterSheetView(initialFilters: vm.filters, scope: .search) { newFilters in
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
                SwaplPageTitle(String(localized: "Explore"))
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
                    title: String(localized: "Homes unavailable"),
                    description: error,
                    actionTitle: String(localized: "Try Again"),
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // No-results is handled per-mode INSIDE this stack (DOK-216):
                // the map stays mounted with an overlay, and the list keeps its
                // search bar + chips above an inline empty state — so the user
                // never lands on a blank page that drops them out of context.
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
            if vm.items.isEmpty {
                mapEmptyOverlay
            }
        }
    }

    // Map mode, zero results: keep the map visible and float a dismissable
    // "no homes here" card over it instead of unmounting to a blank page.
    private var mapEmptyOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text("No homes found")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Try a different city, date range, or sort order.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .multilineTextAlignment(.center)
            // Widen the search (drop the city, keep dates/guests) — the practical
            // "increase the radius" (DOK-216); falls back to a full clear.
            if !vm.filters.cities.isEmpty {
                Button {
                    widenSearch()
                } label: {
                    Text("Search a wider area")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            } else if !mapSearchText.isEmpty || vm.filters.activeFilterCount > 0 {
                Button {
                    clearSearchAndFilters()
                } label: {
                    Text("Clear search")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(24)
        .frame(maxWidth: 320)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .shadow(color: .black.opacity(0.14), radius: 20, x: 0, y: 10)
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .accessibilityElement(children: .combine)
    }

    private func clearSearchAndFilters() {
        mapSearchText = ""
        locationSearch.clearSearch()
        var f = SearchFilters()
        f.sort = vm.filters.sort
        Task { await vm.apply(f) }
    }

    // Broaden the search by dropping the city/destination filter while keeping
    // dates, guests and other filters (DOK-216 "increase the radius").
    private func widenSearch() {
        mapSearchText = ""
        locationSearch.clearSearch()
        var f = vm.filters
        f.cities = []
        Task { await vm.apply(f) }
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
                Text(viewMode == .list ? String(localized: "Map") : String(localized: "List"))
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
            // Leave room on the right so the selection card sits on the SAME LINE
            // as the locate/draw pills instead of covering them (DOK-216).
            .padding(.leading, 22)
            .padding(.trailing, 70)
        }
        .buttonStyle(.plain)
    }

    private var exploreContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SwaplPageTitle(String(localized: "Explore")) { exploreControls }
                exploreSearchField
                categoryStrip
                if vm.items.isEmpty {
                    // List mode, zero results: stay on the page with the search
                    // bar + chips above, so the user can refine in place (DOK-216).
                    exploreInlineEmpty
                } else {
                    if let first = vm.items.first {
                        continueCard(first)
                    }
                    listingSection(title: String(localized: "Homes guests love"), items: Array(vm.items.prefix(6)), compact: true)
                    // "Available for similar dates" only makes sense once the user
                    // has actually specified dates to compare against (DOK-216).
                    if vm.filters.dateFrom != nil || vm.filters.dateTo != nil {
                        listingSection(title: String(localized: "Available for similar dates"), items: Array(vm.items.dropFirst(3).prefix(6)), compact: false)
                    }
                }
            }
            .padding(.bottom, 110)
        }
        .background(SwaplSemanticLight.background)
    }

    // Explore search bar (DOK-216): a tappable Where/When/Who pill that opens the
    // full search composer (destination + dates + guests + pets), Airbnb-style —
    // so search is no longer city-only. The composer is FilterSheetView, which
    // already owns the destination autocomplete, date range, guests and pets.
    private var exploreSearchField: some View {
        Button {
            isShowingSearch = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text(searchSummaryTitle)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(vm.filters.cities.isEmpty ? AirbnbPalette.secondaryText : AirbnbPalette.text)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .frame(height: 54)
            .frame(maxWidth: .infinity)
            .glassEffect(.regular.interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 22)
        .accessibilityLabel("Search homes by destination, dates and guests")
    }

    private var searchSummaryTitle: String {
        vm.filters.cities.isEmpty
            ? String(localized: "Where to?")
            : vm.filters.cities.joined(separator: ", ")
    }

    private var exploreInlineEmpty: some View {
        VStack(spacing: 14) {
            Image(systemName: "house")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text("No homes found")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Try a different city, date range, or sort order.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .multilineTextAlignment(.center)
            Button {
                if vm.filters.activeFilterCount > 0 {
                    clearSearchAndFilters()
                } else {
                    isShowingFilters = true
                }
            } label: {
                Text(vm.filters.activeFilterCount > 0 ? String(localized: "Clear search") : String(localized: "Adjust Filters"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .padding(.horizontal, 22)
    }

    // Explore header controls — same 44×44 glass-circle treatment as the Trips,
    // Wishlists and Messages tabs so the filter/sort pills line up across pages.
    // Get Inspired keeps its brand tint; filter carries the active-filter dot.
    private var exploreControls: some View {
        HStack(spacing: 8) {
            Button {
                isShowingInspire = true
            } label: {
                Image(systemName: "sparkles")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel("Get Inspired, compose a swap package")

            Button {
                isShowingFilters = true
            } label: {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular.interactive(), in: .circle)
                    .overlay(alignment: .topTrailing) {
                        if vm.filters.activeFilterCount > 0 {
                            Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                        }
                    }
            }
            .accessibilityLabel(
                vm.filters.activeFilterCount > 0
                    ? "More filters, \(vm.filters.activeFilterCount) active"
                    : "More filters"
            )

            Menu {
                sortButton(String(localized: "Best match"), value: "match")
                sortButton(String(localized: "Newest"), value: "newest")
                sortButton(String(localized: "Largest"), value: "size_desc")
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel("Sort homes")
        }
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
    // + sort. Self-contained capsule styling for the floating map search bar.
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
                    sortButton(String(localized: "Best match"), value: "match")
                    sortButton(String(localized: "Newest"), value: "newest")
                    sortButton(String(localized: "Largest"), value: "size_desc")
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
                    Text(item.matchScore.map { String(localized: "\($0)% match") } ?? String(localized: "Guest favorite"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.white, in: Capsule())
                        .padding(10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }

                // DOK-160: small private-room chip so single-room homes read at a
                // glance in Browse. Anchored bottom-leading to clear the match
                // pill (top-leading) and the favorite heart (top-trailing).
                if item.listing.isPrivateRoom {
                    HStack(spacing: 4) {
                        Image(systemName: "bed.double.fill")
                            .font(.system(size: compact ? 9 : 11, weight: .bold))
                        Text("Private room")
                            .font(.swaplBody(compact ? SwaplDesignSystem.FontSize.tiny : SwaplDesignSystem.FontSize.small, weight: .bold))
                    }
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, compact ? 7 : 10)
                    .padding(.vertical, compact ? 4 : 6)
                    .background(.white, in: Capsule())
                    .padding(compact ? 6 : 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }

            Text(primaryLocation)
                .font(.swaplBody(compact ? SwaplDesignSystem.FontSize.small : SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
                .padding(.top, compact ? 3 : 0)
            Text(compact ? compactSubtitle : String(localized: "\(item.listing.sleeps) guests · \(item.listing.bedrooms) beds"))
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

    // F4: never synthesize a star rating from the match score. The compact card
    // shows the real match % when available, otherwise just the bed count.
    private var compactSubtitle: String {
        if let score = item.matchScore {
            return String(localized: "\(item.listing.bedrooms) beds · \(score)% match")
        }
        return String(localized: "\(item.listing.bedrooms) beds")
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
    @State private var locator = UserLocator()

    // Draw-to-search: when on, dragging traces a freeform lasso (map panning is
    // disabled). On release the screen path is converted to coordinates and the
    // pins are filtered to those inside it.
    @State private var drawMode = false
    @State private var dragScreenPoints: [CGPoint] = []
    @State private var drawnArea: [CLLocationCoordinate2D] = []

    // Only listings we can actually place on the map. An unknown city with no
    // own lat/lng resolves to nil (F3/F23) and is simply not plotted, rather
    // than being dropped on a hardcoded foreign centroid.
    private var points: [ListingMapPoint] { items.compactMap(ListingMapPoint.init) }

    // Pins, narrowed to the drawn lasso when one exists.
    private var displayedPoints: [ListingMapPoint] {
        guard drawnArea.count >= 3 else { return points }
        return points.filter { isInside($0.coordinate, polygon: drawnArea) }
    }

    var body: some View {
        MapReader { proxy in
            Map(position: $camera, interactionModes: drawMode ? [] : .all) {
                ForEach(displayedPoints) { point in
                    Annotation(point.title, coordinate: point.coordinate) {
                        MapListingPin(point: point, selected: selectedId == point.id) {
                            withAnimation(.snappy) { selectedId = point.id }
                        }
                    }
                }
                .annotationTitles(.hidden)

                if drawnArea.count >= 3 {
                    MapPolygon(coordinates: drawnArea)
                        .foregroundStyle(SwaplSemanticLight.primary.opacity(0.12))
                        .stroke(SwaplSemanticLight.primary, lineWidth: 2)
                }

                // The blue "you are here" dot (shown once location is authorized).
                UserAnnotation()
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .ignoresSafeArea()
            // Freeform draw layer — only intercepts touches while drawing.
            .overlay {
                if drawMode { drawCanvas(proxy: proxy) }
            }
            .overlay(alignment: .bottomTrailing) { mapControlStack }
            .overlay(alignment: .bottom) {
                if drawnArea.count >= 3 { areaSummary }
            }
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
    }

    private func drawCanvas(proxy: MapProxy) -> some View {
        Canvas { ctx, _ in
            guard dragScreenPoints.count > 1 else { return }
            var path = Path()
            path.addLines(dragScreenPoints)
            ctx.stroke(
                path,
                with: .color(SwaplSemanticLight.primary),
                style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round, dash: [1, 6])
            )
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in dragScreenPoints.append(value.location) }
                .onEnded { _ in
                    let coords = dragScreenPoints.compactMap { proxy.convert($0, from: .local) }
                    if coords.count >= 3 { drawnArea = coords }
                    dragScreenPoints = []
                    drawMode = false
                }
        )
    }

    // Glass control stack: locate-me, draw toggle (+ clear when a lasso exists).
    private var mapControlStack: some View {
        VStack(spacing: 10) {
            Button {
                Task {
                    if let coord = await locator.locate() {
                        withAnimation(.easeInOut(duration: 0.4)) {
                            let region = MKCoordinateRegion(
                                center: coord,
                                span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
                            )
                            camera = .region(region)
                            currentRegion = region
                        }
                    }
                }
            } label: {
                Group {
                    if locator.isLocating {
                        ProgressView()
                    } else {
                        Image(systemName: "location.fill")
                    }
                }
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel(Text("Center on my location"))

            Button {
                drawnArea = []
                dragScreenPoints = []
                drawMode.toggle()
            } label: {
                Image(systemName: drawMode ? "pencil.slash" : "scribble.variable")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(drawMode ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .background {
                        if drawMode { Circle().fill(SwaplSemanticLight.primary) }
                    }
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel(Text(drawMode ? "Cancel drawing" : "Draw an area to search"))

            if drawnArea.count >= 3 {
                Button {
                    withAnimation(.snappy) { drawnArea = [] }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 44, height: 44)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .accessibilityLabel(Text("Clear drawn area"))
            }
        }
        // Bottom-right, lifted clear of the tab bar so the search bar at the top
        // no longer hides these (DOK-216).
        .padding(.trailing, 14)
        .padding(.bottom, 100)
    }

    private var areaSummary: some View {
        Text(displayedPoints.count == 1
             ? String(localized: "1 home in this area")
             : String(localized: "\(displayedPoints.count) homes in this area"))
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .glassEffect(.regular, in: .capsule)
            .padding(.bottom, 28)
    }

    // Ray-casting point-in-polygon over lat/lng (fine at city zoom levels).
    private func isInside(_ c: CLLocationCoordinate2D, polygon: [CLLocationCoordinate2D]) -> Bool {
        guard polygon.count >= 3 else { return true }
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let a = polygon[i], b = polygon[j]
            if ((a.latitude > c.latitude) != (b.latitude > c.latitude)) &&
                (c.longitude < (b.longitude - a.longitude) * (c.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) {
                inside.toggle()
            }
            j = i
        }
        return inside
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
    let coordinate: CLLocationCoordinate2D

    // Fails (returns nil) when the listing has neither its own lat/lng nor a
    // known city centroid, so callers can drop it from the map (F3/F23).
    init?(_ item: ListingWithScore) {
        guard let coordinate = ListingGeo.coordinate(for: item.listing) else { return nil }
        self.item = item
        self.coordinate = coordinate
    }

    var id: String { item.listing.id }
    var title: String { item.listing.title }
    var matchScore: Int? { item.matchScore }
}

// Resolves a map coordinate for a listing. Uses the listing's own lat/lng when
// present; otherwise falls back to a known city centroid plus a small, stable
// per-listing offset so multiple homes in the same city don't stack exactly.
// When a city has no known centroid, we DO NOT drop a pin on a hardcoded
// foreign city — we return nil so the listing simply isn't plotted (F3/F23).
// Lightweight cross-view router so the listing-detail city pill can ask the
// Explore tab to show the map centered on a city (DOK-216). Mirrors SiriRouter.
@MainActor
@Observable
final class ExploreRouter {
    static let shared = ExploreRouter()
    private init() {}
    var pendingMapCity: String?
}

// One-shot "where am I" helper for the map's locate button (DOK-216). Requests
// When-In-Use permission if needed, then returns a single current-location fix.
@MainActor
@Observable
final class UserLocator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var authCont: CheckedContinuation<Void, Never>?
    private var locCont: CheckedContinuation<CLLocationCoordinate2D?, Never>?
    var isLocating = false

    override init() {
        super.init()
        manager.delegate = self
    }

    func locate() async -> CLLocationCoordinate2D? {
        isLocating = true
        defer { isLocating = false }
        if manager.authorizationStatus == .notDetermined {
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                authCont = c
                manager.requestWhenInUseAuthorization()
            }
        }
        guard manager.authorizationStatus == .authorizedWhenInUse
            || manager.authorizationStatus == .authorizedAlways else { return nil }
        return await withCheckedContinuation { (c: CheckedContinuation<CLLocationCoordinate2D?, Never>) in
            locCont = c
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard manager.authorizationStatus != .notDetermined else { return }
            authCont?.resume(); authCont = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            locCont?.resume(returning: locations.first?.coordinate); locCont = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            locCont?.resume(returning: nil); locCont = nil
        }
    }
}

enum ListingGeo {
    static func coordinate(for listing: Listing) -> CLLocationCoordinate2D? {
        if let lat = listing.lat, let lng = listing.lng {
            return CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
        guard let base = centroid(for: listing.city) else { return nil }
        let offset = jitter(for: listing.id)
        return CLLocationCoordinate2D(latitude: base.latitude + offset.lat,
                                      longitude: base.longitude + offset.lng)
    }

    // Returns nil for an unknown city. The Italian launch market is seeded
    // first, then the existing international cities. There is deliberately no
    // default fallback to a foreign city — an unknown city yields no pin.
    private static func centroid(for city: String) -> CLLocationCoordinate2D? {
        switch city {
        // Italian launch market (F3/F23).
        case "Roma", "Rome":        return .init(latitude: 41.9028, longitude: 12.4964)
        case "Milano", "Milan":     return .init(latitude: 45.4642, longitude: 9.1900)
        case "Firenze", "Florence": return .init(latitude: 43.7696, longitude: 11.2558)
        case "Napoli", "Naples":    return .init(latitude: 40.8518, longitude: 14.2681)
        case "Torino", "Turin":     return .init(latitude: 45.0703, longitude: 7.6869)
        case "Bologna":             return .init(latitude: 44.4949, longitude: 11.3426)
        case "Venezia", "Venice":   return .init(latitude: 45.4408, longitude: 12.3155)
        case "Genova", "Genoa":     return .init(latitude: 44.4056, longitude: 8.9463)
        case "Palermo":             return .init(latitude: 38.1157, longitude: 13.3615)
        case "Bari":                return .init(latitude: 41.1171, longitude: 16.8719)
        case "Verona":              return .init(latitude: 45.4384, longitude: 10.9916)
        // Existing international cities.
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
        default:          return nil
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
