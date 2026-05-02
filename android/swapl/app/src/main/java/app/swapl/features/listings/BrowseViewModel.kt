package app.swapl.features.listings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
) : ViewModel() {

    data class State(
        val items: List<ListingWithScore> = emptyList(),
        val isLoading: Boolean = false,
        val error: String? = null,
        val filters: SearchFilters = SearchFilters(),
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val res = repo.search(_state.value.filters)
                _state.value = _state.value.copy(items = res.items, isLoading = false)
            } catch (t: Throwable) {
                _state.value = _state.value.copy(isLoading = false, error = t.message)
            }
        }
    }
}
