package app.swapl.features.listings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.favorites.FavoritesStore
import app.swapl.core.model.ListingWithScore
import app.swapl.core.repository.ListingRepository
import app.swapl.core.repository.SearchFilters
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BrowseViewModel @Inject constructor(
    private val repo: ListingRepository,
    private val favorites: FavoritesStore,
) : ViewModel() {

    data class State(
        val items: List<ListingWithScore> = emptyList(),
        val isLoading: Boolean = false,
        val isRefreshing: Boolean = false,
        val hasLoaded: Boolean = false,
        val error: String? = null,
        val filters: SearchFilters = SearchFilters(),
        val viewerListingId: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    // Shared heart state (FavoritesStore singleton) so toggles sync with the
    // Wishlists tab and listing detail.
    val favoriteIds: StateFlow<Set<String>> = favorites.ids

    fun load() {
        if (_state.value.hasLoaded || _state.value.isLoading) return
        favorites.loadIdsIfNeeded()
        fetch(showSpinner = true)
    }

    fun toggleFavorite(listingId: String) = favorites.toggle(listingId)

    fun refresh() = fetch(showSpinner = false)

    fun setSort(sort: String) {
        if (_state.value.filters.sort == sort) return
        _state.value = _state.value.copy(filters = _state.value.filters.copy(sort = sort))
        fetch(showSpinner = true)
    }

    fun setCityQuery(query: String) {
        val cities = query.trim().takeIf { it.isNotEmpty() }?.let { listOf(it) } ?: emptyList()
        if (_state.value.filters.cities == cities) return
        _state.value = _state.value.copy(filters = _state.value.filters.copy(cities = cities))
        fetch(showSpinner = true)
    }

    fun applyFilters(filters: SearchFilters) {
        _state.value = _state.value.copy(filters = filters)
        fetch(showSpinner = true)
    }

    private fun fetch(showSpinner: Boolean) {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = showSpinner,
                isRefreshing = !showSpinner,
                error = null,
            )
            try {
                val res = repo.search(_state.value.filters)
                _state.value = _state.value.copy(
                    items = res.items,
                    isLoading = false,
                    isRefreshing = false,
                    hasLoaded = true,
                    viewerListingId = res.viewerListingId,
                )
            } catch (t: Throwable) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    hasLoaded = true,
                    error = t.message,
                )
            }
        }
    }
}
