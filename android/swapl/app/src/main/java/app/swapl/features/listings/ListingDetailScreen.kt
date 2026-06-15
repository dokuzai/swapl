package app.swapl.features.listings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.filled.AcUnit
import androidx.compose.material.icons.filled.Accessible
import androidx.compose.material.icons.filled.Balcony
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Countertops
import androidx.compose.material.icons.filled.Deck
import androidx.compose.material.icons.filled.Dry
import androidx.compose.material.icons.filled.Elevator
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalLaundryService
import androidx.compose.material.icons.filled.LocalParking
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Piano
import androidx.compose.material.icons.filled.Pool
import androidx.compose.material.icons.filled.Roofing
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material.icons.filled.Yard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.vector.ImageVector
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.swapl.core.favorites.FavoritesStore
import app.swapl.core.model.Listing
import app.swapl.core.model.ListingDetailResponse
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.FavoriteHeartButton
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.MatchBadge
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ListingDetailViewModel @Inject constructor(
    private val repo: ListingRepository,
    private val favorites: FavoritesStore,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val listingId: String = checkNotNull(savedState["listingId"])
    var detail by mutableStateOf<ListingDetailResponse?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    // Shared heart state (FavoritesStore singleton) so the detail heart stays
    // in sync with browse cards and the Wishlists tab.
    val favoriteIds = favorites.ids

    fun load() = viewModelScope.launch {
        favorites.loadIdsIfNeeded()
        runCatching { detail = repo.detail(listingId) }
            .onFailure { error = it.message }
    }

    fun toggleFavorite() = favorites.toggle(listingId)
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
    val favoriteIds by vm.favoriteIds.collectAsStateWithLifecycle()
    var showPropose by remember { mutableStateOf(false) }
    var showStayWithKeys by remember { mutableStateOf(false) }
    var keysStayRequested by remember { mutableStateOf(false) }
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
        Box {
            ListingPhoto(photoUrl = d.listing.photos.firstOrNull(), palette = d.listing.palette, height = 240.dp)
            if (!isOwner) {
                FavoriteHeartButton(
                    isFavorite = d.listing.id in favoriteIds,
                    onToggle = { vm.toggleFavorite() },
                    modifier = Modifier
                        .align(androidx.compose.ui.Alignment.TopEnd)
                        .padding(SwaplSpacing.s2),
                )
            }
        }
        d.matchScore?.let { MatchBadge(it) }
        Text(d.listing.title, style = MaterialTheme.typography.displaySmall)
        Text(
            "${d.listing.neighbourhood} · ${d.listing.city}, ${d.listing.country}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            "${d.listing.sleeps} guests · ${d.listing.bedrooms} bedroom${if (d.listing.bedrooms == 1) "" else "s"} · " +
                "${d.listing.bathrooms} bath${if (d.listing.bathrooms == 1) "" else "s"} · ${d.listing.sizeSqm} m²",
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            "Available ${d.listing.availableFrom.take(10)} → ${d.listing.availableTo.take(10)} · " +
                "${d.listing.minStayDays}–${d.listing.maxStayDays} day stays",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        KickerLabel("About this home")
        Text(d.listing.description, style = MaterialTheme.typography.bodyMedium)

        KickerLabel("What this place offers")
        AmenityGrid(amenities(d.listing))

        SurfaceCard(modifier = androidx.compose.ui.Modifier.clickable { onOpenHost(d.host.id) }) {
            Row(
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = androidx.compose.ui.Alignment.Center,
                ) {
                    Text(
                        (d.host.name ?: "?").first().uppercase(),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    KickerLabel("Hosted by")
                    Text(d.host.name ?: "Anonymous", style = MaterialTheme.typography.titleLarge)
                    d.host.bio?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                if (d.host.verified) TagChip("Verified host")
            }
        }

        if (isOwner) {
            PrimaryPill("Edit listing", onClick = { onEdit(d.listing.id) })
        } else {
            ProposeCta(d, onPropose = { showPropose = true })

            // Stay-with-Keys (DOK-155) sits ALONGSIDE the direct swap, never
            // replacing it. It needs no listing of your own, so it stays
            // available even when you haven't published a home.
            androidx.compose.material3.OutlinedButton(
                onClick = { showStayWithKeys = true },
                shape = androidx.compose.foundation.shape.CircleShape,
                modifier = Modifier.fillMaxWidth(),
            ) {
                androidx.compose.material3.Icon(
                    Icons.Default.VpnKey,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                androidx.compose.foundation.layout.Spacer(Modifier.size(SwaplSpacing.s2))
                Text("Stay with points")
            }
            Text(
                "Book one-way using the travel points you earned hosting — no swap back needed. Use this when a direct swap isn't a fit.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            androidx.compose.material3.TextButton(onClick = { showReport = true }) {
                Text("Report this listing", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showStayWithKeys) {
        app.swapl.features.keys.StayWithKeysDialog(
            listingId = d.listing.id,
            availableFrom = d.listing.availableFrom,
            availableTo = d.listing.availableTo,
            minStayDays = d.listing.minStayDays,
            maxStayDays = d.listing.maxStayDays,
            onDismiss = { showStayWithKeys = false },
            onRequested = {
                showStayWithKeys = false
                keysStayRequested = true
            },
        )
    }

    if (keysStayRequested) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { keysStayRequested = false },
            title = { Text("Request sent") },
            text = { Text("Your points are held until the host confirms. You'll find this stay under Trips.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { keysStayRequested = false }) { Text("OK") }
            },
        )
    }

    if (showPropose && d.viewerListingId != null) {
        ProposeSwapDialog(
            proposerListingId = d.viewerListingId,
            targetListingId = d.listing.id,
            onDismiss = { showPropose = false },
            availableFrom = d.listing.availableFrom,
            availableTo = d.listing.availableTo,
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

// Same amenity catalogue and ordering as the iOS amenity grid.
private fun amenities(l: Listing): List<Pair<String, ImageVector>> = buildList {
    if (l.balcony) add("Balcony" to Icons.Default.Balcony)
    if (l.rooftop) add("Rooftop" to Icons.Default.Roofing)
    if (l.garden) add("Garden" to Icons.Default.Yard)
    if (l.courtyard) add("Courtyard" to Icons.Default.Deck)
    if (l.pool) add("Pool" to Icons.Default.Pool)
    if (l.gym) add("Gym" to Icons.Default.FitnessCenter)
    if (l.piano) add("Piano" to Icons.Default.Piano)
    if (l.bikeIncluded) add("Bike included" to Icons.AutoMirrored.Default.DirectionsBike)
    if (l.hasParking) add("Parking" to Icons.Default.LocalParking)
    if (l.wfhSetup) add("Workspace" to Icons.Default.Computer)
    if (l.petsAllowed) add("Pet friendly" to Icons.Default.Pets)
    if (l.stepFreeAccess) add("Step-free" to Icons.Default.Accessible)
    if (l.hasElevator) add("Elevator" to Icons.Default.Elevator)
    if (l.ac) add("AC" to Icons.Default.AcUnit)
    if (l.dishwasher) add("Dishwasher" to Icons.Default.Countertops)
    if (l.washer) add("Washer" to Icons.Default.LocalLaundryService)
    if (l.dryer) add("Dryer" to Icons.Default.Dry)
}

// Two-column amenity grid with icons, like iOS's "What this place offers".
@Composable
private fun AmenityGrid(items: List<Pair<String, ImageVector>>) {
    if (items.isEmpty()) {
        Text(
            "No amenities listed.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        items.chunked(2).forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                rowItems.forEach { (label, icon) ->
                    Row(
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                        Text(label, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (rowItems.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}
