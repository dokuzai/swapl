import Foundation
import MapKit
import SwiftUI

/// Fully resolved place picked from the address autocomplete, ready to prefill
/// the listing form. Coordinates are exact here (stored as-is); the server is
/// responsible for fuzzing them before they are shown to anyone but the owner.
struct ResolvedAddress: Equatable {
    let address: String
    let city: String
    let neighbourhood: String
    let country: String
    let latitude: Double
    let longitude: Double
}

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

            let coordinate = item.location.coordinate
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
                center: item.location.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
            )
            selectedLocation = item.location.coordinate
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

    /// Resolve a tapped suggestion into the full set of fields the listing form
    /// needs (DOK-182): street address, city, neighbourhood, country and the
    /// coordinate. The coordinate is stored precisely; the server fuzzes it
    /// before showing it publicly, so the exact pin never leaks.
    func resolveAddress(_ suggestion: MKLocalSearchCompletion) async -> ResolvedAddress? {
        let request = MKLocalSearch.Request(completion: suggestion)
        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else { return nil }
            return resolvedAddress(from: item, fallbackTitle: suggestion.title)
        } catch {
            return nil
        }
    }

    // MKMapItem.placemark is deprecated on iOS 26, but it is the ONLY source of
    // the street, postal code and sub-locality (the neighbourhood / Turkish
    // "mahalle"). The replacement MKAddressRepresentations exposes city/region
    // only. Contained here so the deprecation lives in one documented place.
    @available(iOS, deprecated: 26.0, message: "placemark is the only source of street + sub-locality; MapKit has no equivalent")
    private func resolvedAddress(from item: MKMapItem, fallbackTitle: String) -> ResolvedAddress {
        let pm = item.placemark
        let city = pm.locality ?? pm.subAdministrativeArea ?? ""
        // Prefer a real sub-locality (district/quartiere); fall back to city.
        let neighbourhood = pm.subLocality ?? city
        let street = [pm.thoroughfare, pm.subThoroughfare]
            .compactMap { $0 }
            .joined(separator: " ")
        let address = [street, pm.postalCode ?? "", city]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .uniqued()
            .joined(separator: ", ")
        return ResolvedAddress(
            address: address.isEmpty ? fallbackTitle : address,
            city: city,
            neighbourhood: neighbourhood,
            country: pm.country ?? "",
            latitude: item.location.coordinate.latitude,
            longitude: item.location.coordinate.longitude
        )
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
            let reps = response.mapItems.first?.addressRepresentations
            return reps?.cityName
                ?? reps?.regionName
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

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
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
