package app.swapl.core.favorites

import app.swapl.core.repository.FavoritesRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

// Session-wide favorites state shared by browse cards, the listing detail
// heart, and the Wishlists tab — the Android twin of iOS's FavoritesStore
// (ios/Swapl/Core/Favorites/FavoritesStore.swift). Ids load once per session
// via the cheap /api/favorites/ids endpoint; toggles are optimistic with
// rollback on error.
@Singleton
class FavoritesStore @Inject constructor(
    private val repo: FavoritesRepository,
) {
    // Singleton outlives any screen, so toggles run on an app-scoped scope.
    // Main.immediate keeps all state mutations on the main thread (Ktor
    // suspends off-main internally), so plain sets are safe here.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _ids = MutableStateFlow<Set<String>>(emptySet())
    val ids: StateFlow<Set<String>> = _ids.asStateFlow()

    private var hasLoadedIds = false
    private val inFlight = mutableSetOf<String>()

    // Called when an authenticated screen appears (and again on pull-to-refresh
    // of the Wishlists tab via `reloadIds`). Silently no-ops on failure — the
    // endpoint would just 401 when signed out and hearts stay unfilled.
    fun loadIdsIfNeeded() {
        if (hasLoadedIds) return
        scope.launch { reloadIds() }
    }

    suspend fun reloadIds() {
        runCatching { repo.ids().ids.toSet() }
            .onSuccess {
                _ids.value = it
                hasLoadedIds = true
            }
        // On failure leave existing state; browse hearts simply stay unfilled.
    }

    // Clears local state on sign-out so the next account doesn't inherit hearts.
    fun reset() {
        _ids.value = emptySet()
        hasLoadedIds = false
        inFlight.clear()
    }

    fun toggle(listingId: String) {
        if (listingId in inFlight) return
        val wasFavorite = listingId in _ids.value
        // Optimistic flip.
        _ids.value = if (wasFavorite) _ids.value - listingId else _ids.value + listingId
        inFlight += listingId
        scope.launch {
            try {
                if (wasFavorite) repo.remove(listingId) else repo.add(listingId)
            } catch (_: Throwable) {
                // Roll back the optimistic flip.
                _ids.value = if (wasFavorite) _ids.value + listingId else _ids.value - listingId
            } finally {
                inFlight -= listingId
            }
        }
    }
}
