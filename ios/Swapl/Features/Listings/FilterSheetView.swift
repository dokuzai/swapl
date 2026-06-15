import SwiftUI
import Observation
import MapKit
import SwaplDesignTokens

// Browse filter panel, opened from the "Start your search" bar. Edits a local
// copy of SearchFilters and hands it back on Apply; mirrors the web's
// FilterSidebar semantics (city, type, minSqm, minSleeps, must-haves, dates).
struct FilterSheetView: View {
    let initialFilters: SearchFilters
    let onApply: (SearchFilters) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var cities: [String]
    @State private var propertyTypes: Set<String>
    @State private var minSqm: Double
    @State private var minSleeps: Double
    @State private var petsRequired: Bool
    @State private var wfhRequired: Bool
    @State private var stepFreeRequired: Bool
    @State private var filterByDates: Bool
    @State private var dateFrom: Date
    @State private var dateTo: Date

    // Type-ahead state — MapKit place search (same engine as the browse map,
    // DOK-182/183). The completer suggests real places worldwide; on tap we
    // resolve the suggestion to a city name and add it as a filter chip.
    @State private var cityQuery = ""
    @State private var location = LocationSearchService()
    @State private var resolvingCity = false
    @FocusState private var cityFieldFocused: Bool

    private static let allPropertyTypes: [(value: String, label: String)] = [
        ("APARTMENT", "Apartment"),
        ("HOUSE", "House"),
        ("LOFT", "Loft"),
        ("TOWNHOUSE", "Townhouse")
    ]

    init(initialFilters: SearchFilters, onApply: @escaping (SearchFilters) -> Void) {
        self.initialFilters = initialFilters
        self.onApply = onApply
        _cities = State(initialValue: initialFilters.cities)
        _propertyTypes = State(initialValue: Set(initialFilters.propertyTypes))
        _minSqm = State(initialValue: Double(initialFilters.minSqm))
        _minSleeps = State(initialValue: Double(initialFilters.minSleeps))
        _petsRequired = State(initialValue: initialFilters.petsRequired)
        _wfhRequired = State(initialValue: initialFilters.wfhRequired)
        _stepFreeRequired = State(initialValue: initialFilters.stepFreeRequired)
        let hasDates = initialFilters.dateFrom != nil || initialFilters.dateTo != nil
        _filterByDates = State(initialValue: hasDates)
        let from = initialFilters.dateFrom.flatMap(SwaplDateText.parse) ?? Date()
        let to = initialFilters.dateTo.flatMap(SwaplDateText.parse)
            ?? Calendar.current.date(byAdding: .month, value: 1, to: from) ?? from
        _dateFrom = State(initialValue: from)
        _dateTo = State(initialValue: max(to, from))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    destinationSection
                    datesSection
                    propertyTypeSection
                    sizeSection
                    sleepsSection
                    mustHavesSection
                }
                .padding(.horizontal, 22)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Close filters")
                }
            }
            .safeAreaInset(edge: .bottom) { bottomBar }
        }
        .onChange(of: cityQuery) { _, newValue in
            location.updateSearch(newValue)
        }
    }

    // MARK: - Destination (type-ahead, multi-select chips)

    private var destinationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Where to?")

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                TextField("Search destinations", text: $cityQuery)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.text)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.words)
                    .focused($cityFieldFocused)
                    .accessibilityLabel("Search destination cities")
                if location.isSearching || resolvingCity {
                    ProgressView().controlSize(.small)
                } else if !cityQuery.isEmpty {
                    Button {
                        cityQuery = ""
                        location.clearSearch()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Clear destination search")
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(cityFieldFocused ? AirbnbPalette.text : AirbnbPalette.hairline)
            )

            if !location.suggestions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(location.suggestions.enumerated()), id: \.offset) { index, item in
                        Button {
                            selectSuggestion(item)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle")
                                    .font(.system(size: 18))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(item.title)
                                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                        .foregroundStyle(AirbnbPalette.text)
                                    if !item.subtitle.isEmpty {
                                        Text(item.subtitle)
                                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                            .foregroundStyle(AirbnbPalette.secondaryText)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(item.title), \(item.subtitle)")

                        if index != location.suggestions.count - 1 {
                            Divider().padding(.leading, 46)
                        }
                    }
                }
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                )
            }

            if !cities.isEmpty {
                FilterFlowChips(items: cities) { city in
                    Button {
                        cities.removeAll { $0 == city }
                    } label: {
                        HStack(spacing: 6) {
                            Text(city)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .bold))
                        }
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(city) from destinations")
                }
            }
        }
    }

    // Resolve a tapped MapKit suggestion to a city name, then add it as a chip.
    private func selectSuggestion(_ suggestion: MKLocalSearchCompletion) {
        cityFieldFocused = false
        resolvingCity = true
        Task {
            let resolved = await location.resolveCityName(suggestion)
            let city = (resolved ?? suggestion.title)
                .trimmingCharacters(in: .whitespaces)
            if !city.isEmpty, !cities.contains(city) {
                cities.append(city)
            }
            cityQuery = ""
            location.clearSearch()
            resolvingCity = false
        }
    }

    // MARK: - Dates

    private var datesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $filterByDates.animation(.snappy)) {
                sectionTitle("Available between")
            }
            .tint(SwaplSemanticLight.primary)

            if filterByDates {
                VStack(spacing: 0) {
                    DatePicker("From", selection: $dateFrom, displayedComponents: .date)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                    Divider().padding(.leading, 16)
                    DatePicker("To", selection: $dateTo, in: dateFrom..., displayedComponents: .date)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                }
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                )
            }
        }
    }

    // MARK: - Property type

    private var propertyTypeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Property type")
            FilterFlowChips(items: Self.allPropertyTypes.map(\.value)) { value in
                let label = Self.allPropertyTypes.first { $0.value == value }?.label ?? value
                let on = propertyTypes.contains(value)
                Button {
                    if on { propertyTypes.remove(value) } else { propertyTypes.insert(value) }
                } label: {
                    AirbnbChip(title: label, selected: on)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
        }
    }

    // MARK: - Size / sleeps

    private var sizeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionTitle("Minimum size")
                Spacer()
                Text("\(Int(minSqm)) m²")
                    .font(.swaplMono(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Slider(value: $minSqm, in: 30...300, step: 5)
                .tint(SwaplSemanticLight.primary)
                .accessibilityLabel("Minimum size in square meters")
                .accessibilityValue("\(Int(minSqm)) square meters")
        }
    }

    private var sleepsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionTitle("Sleeps at least")
                Spacer()
                Text("\(Int(minSleeps))")
                    .font(.swaplMono(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Slider(value: $minSleeps, in: 1...8, step: 1)
                .tint(SwaplSemanticLight.primary)
                .accessibilityLabel("Minimum number of guests")
                .accessibilityValue("\(Int(minSleeps)) guests")
        }
    }

    // MARK: - Must-haves

    private var mustHavesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Must-haves")
            VStack(spacing: 0) {
                mustHaveRow("Pet-friendly", icon: "pawprint", isOn: $petsRequired)
                Divider().padding(.leading, 50)
                mustHaveRow("Work-from-home setup", icon: "desktopcomputer", isOn: $wfhRequired)
                Divider().padding(.leading, 50)
                mustHaveRow("Step-free access", icon: "figure.roll", isOn: $stepFreeRequired)
            }
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
        }
    }

    private func mustHaveRow(_ title: String, icon: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 17))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 24)
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                    .foregroundStyle(AirbnbPalette.text)
            }
        }
        .tint(SwaplSemanticLight.primary)
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack(spacing: 16) {
            Button {
                resetAll()
            } label: {
                Text("Reset")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .underline()
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Reset all filters")

            Spacer()

            Button {
                onApply(builtFilters)
                dismiss()
            } label: {
                Text("Show homes")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 15)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .accessibilityLabel("Apply filters and show homes")
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
        .background(SwaplSemanticLight.card)
        .overlay(alignment: .top) { AirbnbPalette.hairline.frame(height: 1) }
    }

    private func resetAll() {
        withAnimation(.snappy) {
            cities = []
            propertyTypes = []
            minSqm = 30
            minSleeps = 1
            petsRequired = false
            wfhRequired = false
            stepFreeRequired = false
            filterByDates = false
            cityQuery = ""
        }
        location.clearSearch()
    }

    private var builtFilters: SearchFilters {
        var f = initialFilters // keeps sort
        f.page = 1
        f.cities = cities
        f.propertyTypes = Self.allPropertyTypes.map(\.value).filter(propertyTypes.contains)
        f.minSqm = Int(minSqm)
        f.minSleeps = Int(minSleeps)
        f.petsRequired = petsRequired
        f.wfhRequired = wfhRequired
        f.stepFreeRequired = stepFreeRequired
        f.dateFrom = filterByDates ? SwaplDateText.apiString(from: dateFrom) : nil
        f.dateTo = filterByDates ? SwaplDateText.apiString(from: max(dateTo, dateFrom)) : nil
        return f
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
    }
}

// Simple wrapping chip layout (iOS 17 Layout protocol) so selected cities and
// property types flow onto multiple lines.
struct FilterFlowChips<Content: View>: View {
    let items: [String]
    @ViewBuilder let content: (String) -> Content

    var body: some View {
        FilterFlowLayout(spacing: 10) {
            ForEach(items, id: \.self) { content($0) }
        }
    }
}

struct FilterFlowLayout: Layout {
    var spacing: CGFloat = 10

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width.isFinite ? width : x, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
