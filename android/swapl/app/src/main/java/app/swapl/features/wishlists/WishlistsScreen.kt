package app.swapl.features.wishlists

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.swapl.core.favorites.FavoritesStore
import app.swapl.core.model.Listing
import app.swapl.core.repository.FavoritesRepository
import app.swapl.design.components.FavoriteHeartButton
import app.swapl.design.components.ListingPhoto
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class WishlistsViewModel @Inject constructor(
    private val repo: FavoritesRepository,
    private val favorites: FavoritesStore,
) : ViewModel() {

    data class State(
        val items: List<Listing> = emptyList(),
        val isLoading: Boolean = false,
        val isRefreshing: Boolean = false,
        val hasLoaded: Boolean = false,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    // Shared heart state so un-hearting elsewhere reflects here without refetch.
    val favoriteIds: StateFlow<Set<String>> = favorites.ids

    fun load() {
        if (_state.value.hasLoaded || _state.value.isLoading) return
        fetch(showSpinner = true)
    }

    fun refresh() {
        viewModelScope.launch { favorites.reloadIds() }
        fetch(showSpinner = false)
    }

    fun toggleFavorite(listingId: String) = favorites.toggle(listingId)

    private fun fetch(showSpinner: Boolean) {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = showSpinner,
                isRefreshing = !showSpinner,
                error = null,
            )
            try {
                val res = repo.list()
                _state.value = _state.value.copy(
                    items = res.items,
                    isLoading = false,
                    isRefreshing = false,
                    hasLoaded = true,
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

// Saved homes (favorites) in a two-column grid, like iOS's WishlistsView.
// Hearts come from the shared FavoritesStore so unfavoriting here is
// reflected on browse and detail too.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistsScreen(
    onOpen: (String) -> Unit = {},
    vm: WishlistsViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val favoriteIds by vm.favoriteIds.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }

    // Hide homes un-hearted since the last fetch so the tab tracks the shared
    // store without a refetch on every toggle.
    val visibleItems = state.items.filter { it.id in favoriteIds }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh() },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            state.isLoading && !state.hasLoaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null -> ErrorState(onRetry = { vm.refresh() })
            visibleItems.isEmpty() && state.hasLoaded -> EmptyState()
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
                modifier = Modifier.fillMaxSize(),
            ) {
                item(span = { GridItemSpan(2) }) {
                    Text(
                        "Wishlists",
                        style = MaterialTheme.typography.displaySmall,
                        modifier = Modifier.padding(horizontal = SwaplSpacing.s1, vertical = SwaplSpacing.s2),
                    )
                }
                items(visibleItems, key = { it.id }) { listing ->
                    WishlistCard(
                        listing = listing,
                        isFavorite = listing.id in favoriteIds,
                        onToggleFavorite = { vm.toggleFavorite(listing.id) },
                        onClick = { onOpen(listing.id) },
                    )
                }
            }
        }
    }
}

// A width-flexible variant of the browse card for the wishlist grid.
@Composable
private fun WishlistCard(
    listing: Listing,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box {
            ListingPhoto(
                photoUrl = listing.photos.firstOrNull(),
                palette = listing.palette,
                height = 160.dp,
            )
            FavoriteHeartButton(
                isFavorite = isFavorite,
                onToggle = onToggleFavorite,
                modifier = Modifier.align(Alignment.TopEnd).padding(SwaplSpacing.s2),
            )
        }
        Spacer(Modifier.height(SwaplSpacing.s1))
        Text(
            "${listing.neighbourhood}, ${listing.city}",
            style = MaterialTheme.typography.titleLarge,
            maxLines = 1,
        )
        Text(
            "${listing.sleeps} guests · ${listing.bedrooms} bed${if (listing.bedrooms == 1) "" else "s"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            "Available ${listing.availableFrom.take(10)} → ${listing.availableTo.take(10)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Wishlists unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "We couldn't reach Swapl. Check your connection and try again.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Try Again") }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Default.FavoriteBorder,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp),
            )
        }
        Spacer(Modifier.height(SwaplSpacing.s4))
        Text("No saved homes yet", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "Tap the heart on any home to save it here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
