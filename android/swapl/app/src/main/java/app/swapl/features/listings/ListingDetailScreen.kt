package app.swapl.features.listings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Listing
import app.swapl.core.model.ListingDetailResponse
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.MatchBadge
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ListingDetailViewModel @Inject constructor(
    private val repo: ListingRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val listingId: String = checkNotNull(savedState["listingId"])
    var detail by mutableStateOf<ListingDetailResponse?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        runCatching { detail = repo.detail(listingId) }
            .onFailure { error = it.message }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ListingDetailScreen(
    onOpenHost: (String) -> Unit = {},
    onEdit: (String) -> Unit = {},
    vm: ListingDetailViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val d = vm.detail
    var showPropose by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }

    if (d == null) return
    val isOwner = d.viewerListingId == d.listing.id

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        CityIllust(palette = SwaplCityPalettes.forName(d.listing.palette), modifier = Modifier.height(200.dp))
        d.matchScore?.let { MatchBadge(it) }
        Text(d.listing.title, style = MaterialTheme.typography.displaySmall)
        Text(
            "${d.listing.neighbourhood} · ${d.listing.city}, ${d.listing.country}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(d.listing.description, style = MaterialTheme.typography.bodyMedium)

        FlowRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            amenityChips(d.listing).take(8).forEach { TagChip(it) }
        }

        SurfaceCard(modifier = androidx.compose.ui.Modifier.clickable { onOpenHost(d.host.id) }) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("Hosted by")
                Text(d.host.name ?: "Anonymous", style = MaterialTheme.typography.titleLarge)
                d.host.bio?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (d.host.verified) TagChip("ID verified")
            }
        }

        if (isOwner) {
            PrimaryPill("Edit listing", onClick = { onEdit(d.listing.id) })
        } else {
            ProposeCta(d, onPropose = { showPropose = true })

            androidx.compose.material3.TextButton(onClick = { showReport = true }) {
                Text("Report this listing", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showPropose && d.viewerListingId != null) {
        ProposeSwapDialog(
            proposerListingId = d.viewerListingId,
            targetListingId = d.listing.id,
            onDismiss = { showPropose = false },
        )
    }

    if (showReport) {
        app.swapl.features.profile.ReportDialog(
            targetUserId = d.host.id,
            listingId = d.listing.id,
            onDismiss = { showReport = false },
        )
    }
}

@Composable
private fun ProposeCta(d: ListingDetailResponse, onPropose: () -> Unit) {
    when {
        d.viewerListingId == null -> {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                PrimaryPill("List your home first", onClick = {}, enabled = false)
                Text(
                    "Add your own listing before you can propose swaps.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        else -> PrimaryPill("Propose a swap", onClick = onPropose)
    }
}

private fun amenityChips(l: Listing): List<String> = buildList {
    if (l.balcony) add("Balcony")
    if (l.rooftop) add("Rooftop")
    if (l.garden) add("Garden")
    if (l.pool) add("Pool")
    if (l.wfhSetup) add("WFH")
    if (l.petsAllowed) add("Pet-friendly")
    if (l.stepFreeAccess) add("Step-free")
    if (l.hasElevator) add("Elevator")
    if (l.ac) add("AC")
    if (l.dishwasher) add("Dishwasher")
    if (l.washer) add("Washer")
    if (l.dryer) add("Dryer")
}
