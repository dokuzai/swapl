package app.swapl.features.trips

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.ProposalSummary
import app.swapl.core.repository.TripsRepository
import app.swapl.features.keys.KeysStaysSection
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import androidx.compose.ui.unit.dp
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TripsViewModel @Inject constructor(private val repo: TripsRepository) : ViewModel() {
    var trips by mutableStateOf<List<ProposalSummary>?>(null)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { trips = repo.trips() }.onFailure { if (trips == null) error = it.message }
    }

    fun refresh() = viewModelScope.launch {
        isRefreshing = true
        runCatching { trips = repo.trips() }.onFailure { if (trips == null) error = it.message }
        isRefreshing = false
    }
}

// Lifecycle phase derived from agreement dates — ISO strings compare
// lexicographically, so take(10) against LocalDate.now() is enough.
internal enum class TripPhase(val label: String) {
    Active("Active now"),
    Upcoming("Upcoming"),
    Past("Past"),
}

internal fun ProposalSummary.phase(today: String = java.time.LocalDate.now().toString()): TripPhase =
    when {
        dateTo.take(10) < today -> TripPhase.Past
        dateFrom.take(10) > today -> TripPhase.Upcoming
        else -> TripPhase.Active
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripsScreen(
    onOpen: (String) -> Unit = {},
    vm: TripsViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }

    Column(Modifier.fillMaxSize()) {
        Text(
            "Trips",
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
        )

        PullToRefreshBox(
            isRefreshing = vm.isRefreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            val trips = vm.trips
            when {
                vm.error != null -> ErrorState(onRetry = { vm.load() })
                trips == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                trips.isEmpty() -> LazyColumn(
                    contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
                    verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    // One-directional Keys stays can exist with no swap trips.
                    item(key = "keys-stays") {
                        KeysStaysSection()
                        Spacer(Modifier.height(SwaplSpacing.s3))
                    }
                    item(key = "empty") { EmptyState() }
                }
                else -> {
                    val sections = listOf(
                        TripPhase.Active to trips.filter { it.phase() == TripPhase.Active }.sortedBy { it.dateTo },
                        TripPhase.Upcoming to trips.filter { it.phase() == TripPhase.Upcoming }.sortedBy { it.dateFrom },
                        TripPhase.Past to trips.filter { it.phase() == TripPhase.Past }.sortedByDescending { it.dateTo },
                    ).filter { it.second.isNotEmpty() }
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
                        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        item(key = "keys-stays") {
                            KeysStaysSection()
                            Spacer(Modifier.height(SwaplSpacing.s3))
                        }
                        sections.forEach { (phase, list) ->
                            item(key = "header-${phase.name}") {
                                KickerLabel(phase.label)
                                Spacer(Modifier.height(SwaplSpacing.s1))
                            }
                            items(list, key = { it.id }) { t ->
                                TripRow(t, onClick = { onOpen(t.id) })
                            }
                            item(key = "gap-${phase.name}") { Spacer(Modifier.height(SwaplSpacing.s3)) }
                        }
                    }
                }
            }
        }
    }
}

// Every swap is reciprocal, so each trip carries both roles: you're the guest
// at their place and the host of yours for the same dates.
@Composable
private fun TripRow(t: ProposalSummary, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            // Cover photo of the home you're visiting; layout unchanged without one.
            if (!t.theirCoverPhotoUrl.isNullOrBlank()) {
                ListingPhoto(
                    photoUrl = t.theirCoverPhotoUrl,
                    palette = t.theirCity,
                    height = 64.dp,
                    cornerRadius = SwaplRadius.md,
                    modifier = Modifier.width(64.dp),
                )
                Spacer(Modifier.width(SwaplSpacing.s3))
            }
            Column(Modifier.weight(1f)) {
                Text("Trip to ${t.theirCity}", style = MaterialTheme.typography.titleLarge)
                Text(
                    "${t.dateFrom.take(10)} → ${t.dateTo.take(10)}" +
                        (t.otherName?.let { " · host $it" } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Guest in ${t.theirNeighbourhood} · You host in ${t.myCity}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TagChip(t.phase().label)
        }
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Trips unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "We couldn't load your trips. Pull to refresh or retry.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxWidth().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("No trips yet", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "Accepted swaps become trips. Your upcoming stays will show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
