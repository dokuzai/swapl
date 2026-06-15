import Foundation
import MapKit
import SwiftUI

/// Search-as-you-type place lookup for the browse map (DOK-182). Feed it text
/// via `updateSearch`, read `suggestions`, then `selectSuggestion` (or
/// `searchForText`) to get an `MKCoordinateRegion` to recenter the camera on.
///
/// Ported from HoumApp's MAP_LOCATION_SEARCH_GUIDE §1.1 — Apple frameworks only
/// (MapKit + CoreLocation), no third parties.
@MainActor
@Observable
final class LocationSearchService: NSObject {
    var searchQuery = ""
    var suggestions: [MKLocalSearchCompletion] = []
    var isSearching = false
    var selectedLocation: CLLocationCoordinate2D?
    var selectedRegion: MKCoordinateRegion?

    private let searchCompleter = MKLocalSearchCompleter()
    private var debounceTimer: Timer?

    override init() {
        super.init()
        searchCompleter.delegate = self
        // What kinds of results to return: addresses, POIs and category queries.
        searchCompleter.resultTypes = [.address, .pointOfInterest, .query]
    }

    /// Call on every keystroke. Debounced 0.3s to avoid hammering the completer.
    func updateSearch(_ query: String) {
        searchQuery = query
        debounceTimer?.invalidate()

        if query.isEmpty {
            suggestions = []
            isSearching = false
            return
        }

        isSearching = true
        debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.searchCompleter.queryFragment = query }
        }
    }

    /// Resolve a tapped suggestion into a map region, choosing a sensible zoom
    /// span from the result type (country vs region vs city vs address).
    func selectSuggestion(_ suggestion: MKLocalSearchCompletion) async -> MKCoordinateRegion? {
        isSearching = true
        let request = MKLocalSearch.Request(completion: suggestion)

        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else { isSearching = false; return nil }

            let coordinate = item.placemark.coordinate
            selectedLocation = coordinate

            let span: MKCoordinateSpan
            if suggestion.subtitle.contains("Country") {
                span = MKCoordinateSpan(latitudeDelta: 5.0, longitudeDelta: 5.0)
            } else if suggestion.subtitle.contains("Region") || suggestion.subtitle.contains("Province") {
                span = MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.0)
            } else if suggestion.subtitle.contains("City") || suggestion.title.contains(",") {
                span = MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
            } else {
                span = MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            }

            let region = MKCoordinateRegion(center: coordinate, span: span)
            selectedRegion = region
            isSearching = false
            suggestions = []
            searchQuery = suggestion.title
            return region
        } catch {
            print("Location search failed: \(error)")
            isSearching = false
            return nil
        }
    }

    /// Fallback for a raw text submit (no suggestion tapped) — natural-language search.
    func searchForText(_ text: String) async -> MKCoordinateRegion? {
        guard !text.isEmpty else { return nil }
        isSearching = true

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text

        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else { isSearching = false; return nil }
            let region = MKCoordinateRegion(
                center: item.placemark.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
            )
            selectedLocation = item.placemark.coordinate
            selectedRegion = region
            isSearching = false
            suggestions = []
            return region
        } catch {
            print("Location search failed: \(error)")
            isSearching = false
            return nil
        }
    }

    /// Resolve a tapped suggestion into a city/place name suitable for a text
    /// filter (the browse filter matches listings by city string, not by map
    /// coordinate). Prefers the resolved locality, then the administrative area,
    /// falling back to the first component of the suggestion title.
    func resolveCityName(_ suggestion: MKLocalSearchCompletion) async -> String? {
        let titleFallback = suggestion.title
            .components(separatedBy: ",").first?
            .trimmingCharacters(in: .whitespaces)
        let request = MKLocalSearch.Request(completion: suggestion)
        do {
            let response = try await MKLocalSearch(request: request).start()
            let placemark = response.mapItems.first?.placemark
            return placemark?.locality
                ?? placemark?.administrativeArea
                ?? titleFallback
        } catch {
            return titleFallback
        }
    }

    func clearSearch() {
        debounceTimer?.invalidate()
        searchQuery = ""; suggestions = []; isSearching = false
        selectedLocation = nil; selectedRegion = nil
    }
}

extension LocationSearchService: MKLocalSearchCompleterDelegate {
    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = completer.results
        Task { @MainActor [weak self] in
            self?.suggestions = results
            self?.isSearching = false
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor [weak self] in self?.isSearching = false }
    }
}
