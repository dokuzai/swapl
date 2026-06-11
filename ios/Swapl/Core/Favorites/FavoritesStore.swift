import SwiftUI
import Observation

// Session-wide favorites state shared by browse cards, the listing detail
// heart, and the Wishlists tab. Ids load once per session via the cheap
// /api/favorites/ids endpoint; toggles are optimistic with rollback on error.
@MainActor
@Observable
final class FavoritesStore {
    private(set) var ids: Set<String> = []
    private var hasLoadedIds = false
    private var inFlight: Set<String> = []

    func isFavorite(_ listingId: String) -> Bool {
        ids.contains(listingId)
    }

    // Called when an authenticated session appears (and again on pull-to-refresh
    // of the Wishlists tab via `reloadIds`). Silently no-ops when signed out —
    // the endpoint would just 401.
    func loadIdsIfNeeded() async {
        guard !hasLoadedIds else { return }
        await reloadIds()
    }

    func reloadIds() async {
        do {
            ids = Set(try await FavoritesRepository.shared.ids().ids)
            hasLoadedIds = true
        } catch {
            // Leave existing state; browse hearts simply stay unfilled.
        }
    }

    // Clears local state on sign-out so the next account doesn't inherit hearts.
    func reset() {
        ids = []
        hasLoadedIds = false
        inFlight = []
    }

    func toggle(_ listingId: String) {
        guard !inFlight.contains(listingId) else { return }
        let wasFavorite = ids.contains(listingId)
        // Optimistic flip + haptic.
        if wasFavorite { ids.remove(listingId) } else { ids.insert(listingId) }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        inFlight.insert(listingId)
        Task {
            defer { inFlight.remove(listingId) }
            do {
                if wasFavorite {
                    _ = try await FavoritesRepository.shared.remove(listingId: listingId)
                } else {
                    _ = try await FavoritesRepository.shared.add(listingId: listingId)
                }
            } catch {
                // Roll back the optimistic flip.
                if wasFavorite { ids.insert(listingId) } else { ids.remove(listingId) }
            }
        }
    }
}
