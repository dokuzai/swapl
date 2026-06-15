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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.swapl.R
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
import app.swapl.design.components.OwnerVerifiedBadge
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
    onManageCalendar: (String) -> Unit = {},
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
        // Owner-proof trust badge (DOK-162) — discreet, only when approved.
        if (d.listing.ownerVerified) OwnerVerifiedBadge()
        Text(
            "${d.listing.neighbourhood} · ${d.listing.city}, ${d.listing.country}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(
                R.string.detail_guests_rooms,
                d.listing.sleeps,
                pluralStringResource(R.plurals.detail_bedrooms, d.listing.bedrooms, d.listing.bedrooms),
                pluralStringResource(R.plurals.detail_baths, d.listing.bathrooms, d.listing.bathrooms),
                d.listing.sizeSqm,
            ),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            stringResource(
                R.string.detail_available_range,
                localizedDate(d.listing.availableFrom),
                localizedDate(d.listing.availableTo),
                d.listing.minStayDays,
                d.listing.maxStayDays,
            ),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        // Persisted nightly-Keys value (DOK-163), shown to every viewer so the
        // Stay-with-Keys rate is transparent before they open the booking sheet.
        // Read straight from the DTO — never recomputed on the client.
        d.listing.nightlyKeys?.let { nightly ->
            Row(
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            ) {
                Icon(
                    Icons.Default.VpnKey,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    stringResource(R.string.detail_points_per_night, nightly),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            // Private-room transparency (DOK-163 C) for non-owners too: the
            // nightly value reflects only the room, not the whole home.
            if (d.listing.isPrivateRoom) {
                Text(
                    stringResource(R.string.detail_private_room_note),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        KickerLabel(stringResource(R.string.detail_about_home))
        Text(d.listing.description, style = MaterialTheme.typography.bodyMedium)

        KickerLabel(stringResource(R.string.detail_what_offered))
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
                    KickerLabel(stringResource(R.string.detail_hosted_by))
                    Text(d.host.name ?: stringResource(R.string.detail_anonymous), style = MaterialTheme.typography.titleLarge)
                    d.host.bio?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                if (d.host.verified) TagChip(stringResource(R.string.detail_verified_host))
            }
        }

        if (isOwner) {
            // "How your nightly Keys are calculated" (DOK-163). The structured
            // explanation is owner-only — the server only sends it to the owner,
            // so this only ever appears on your own listing.
            d.listing.valuationExplanation?.let { NightlyKeysExplainer(it) }

            PrimaryPill(stringResource(R.string.detail_edit_listing), onClick = { onEdit(d.listing.id) })
            // Calendar editor (DOK-159): manage which dates are bookable —
            // see confirmed swaps/points stays and block your own dates.
            androidx.compose.material3.OutlinedButton(
                onClick = { onManageCalendar(d.listing.id) },
                shape = CircleShape,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.detail_manage_availability))
            }
            // Optional owner-proof verification (DOK-162) — a trust badge, never
            // a publish gate. Hidden once approved.
            VerifyOwnershipCard(listingId = d.listing.id)
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
                Text(stringResource(R.string.detail_stay_with_points))
            }
            Text(
                stringResource(R.string.detail_stay_with_points_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            androidx.compose.material3.TextButton(onClick = { showReport = true }) {
                Text(stringResource(R.string.detail_report_listing), color = MaterialTheme.colorScheme.error)
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
            title = { Text(stringResource(R.string.detail_request_sent_title)) },
            text = { Text(stringResource(R.string.detail_request_sent_body)) },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { keysStayRequested = false }) { Text(stringResource(R.string.common_ok)) }
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
                PrimaryPill(stringResource(R.string.detail_list_home_first), onClick = {}, enabled = false)
                Text(
                    stringResource(R.string.detail_list_home_first_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        else -> PrimaryPill(stringResource(R.string.detail_propose_swap), onClick = onPropose)
    }
}

// Localize an ISO date for display in the device locale (B2): "15 giu 2026"
// in Italian, "Jun 15, 2026" in English. Falls back to the raw ISO date.
private fun localizedDate(iso: String): String = runCatching {
    java.time.LocalDate.parse(iso.take(10)).format(
        java.time.format.DateTimeFormatter
            .ofLocalizedDate(java.time.format.FormatStyle.MEDIUM)
            .withLocale(java.util.Locale.getDefault()),
    )
}.getOrDefault(iso.take(10))

// Same amenity catalogue and ordering as the iOS amenity grid. Labels are
// string-res ids resolved in the grid composable (B1).
private fun amenities(l: Listing): List<Pair<Int, ImageVector>> = buildList {
    if (l.balcony) add(R.string.amenity_balcony to Icons.Default.Balcony)
    if (l.rooftop) add(R.string.amenity_rooftop to Icons.Default.Roofing)
    if (l.garden) add(R.string.amenity_garden to Icons.Default.Yard)
    if (l.courtyard) add(R.string.amenity_courtyard to Icons.Default.Deck)
    if (l.pool) add(R.string.amenity_pool to Icons.Default.Pool)
    if (l.gym) add(R.string.amenity_gym to Icons.Default.FitnessCenter)
    if (l.piano) add(R.string.amenity_piano to Icons.Default.Piano)
    if (l.bikeIncluded) add(R.string.amenity_bike to Icons.AutoMirrored.Default.DirectionsBike)
    if (l.hasParking) add(R.string.amenity_parking to Icons.Default.LocalParking)
    if (l.wfhSetup) add(R.string.amenity_workspace to Icons.Default.Computer)
    if (l.petsAllowed) add(R.string.amenity_pets to Icons.Default.Pets)
    if (l.stepFreeAccess) add(R.string.amenity_step_free to Icons.Default.Accessible)
    if (l.hasElevator) add(R.string.amenity_elevator to Icons.Default.Elevator)
    if (l.ac) add(R.string.amenity_ac to Icons.Default.AcUnit)
    if (l.dishwasher) add(R.string.amenity_dishwasher to Icons.Default.Countertops)
    if (l.washer) add(R.string.amenity_washer to Icons.Default.LocalLaundryService)
    if (l.dryer) add(R.string.amenity_dryer to Icons.Default.Dry)
}

// Two-column amenity grid with icons, like iOS's "What this place offers".
@Composable
private fun AmenityGrid(items: List<Pair<Int, ImageVector>>) {
    if (items.isEmpty()) {
        Text(
            stringResource(R.string.detail_no_amenities),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        items.chunked(2).forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                rowItems.forEach { (labelRes, icon) ->
                    Row(
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                        Text(stringResource(labelRes), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (rowItems.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}
