package app.swapl.features.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.DiscoverExperience
import app.swapl.core.model.DiscoverService
import app.swapl.core.repository.DiscoverRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// Explore's Experiences/Services tabs (DOK-145). Affiliate links only —
// no prices or availability invented client-side; the only prices shown are
// the concierge add-ons' real DB prices the API returns. Env-gated
// server-side: zero configured partners → clean empty state.

data class DiscoverTabState<T>(
    val items: List<T> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ExperiencesViewModel @Inject constructor(
    private val repo: DiscoverRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(DiscoverTabState<DiscoverExperience>())
    val state: StateFlow<DiscoverTabState<DiscoverExperience>> = _state.asStateFlow()

    fun load(force: Boolean = false) {
        if (!force && (_state.value.hasLoaded || _state.value.isLoading)) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val items = repo.experiences()
                _state.value = DiscoverTabState(items = items, hasLoaded = true)
            } catch (t: Throwable) {
                _state.value = _state.value.copy(isLoading = false, hasLoaded = true, error = t.message)
            }
        }
    }

    fun resolveUrl(raw: String): String = repo.resolveUrl(raw)
}

@HiltViewModel
class ServicesViewModel @Inject constructor(
    private val repo: DiscoverRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(DiscoverTabState<DiscoverService>())
    val state: StateFlow<DiscoverTabState<DiscoverService>> = _state.asStateFlow()

    fun load(force: Boolean = false) {
        if (!force && (_state.value.hasLoaded || _state.value.isLoading)) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val items = repo.services()
                _state.value = DiscoverTabState(items = items, hasLoaded = true)
            } catch (t: Throwable) {
                _state.value = _state.value.copy(isLoading = false, hasLoaded = true, error = t.message)
            }
        }
    }

    fun resolveUrl(raw: String): String = repo.resolveUrl(raw)
}
