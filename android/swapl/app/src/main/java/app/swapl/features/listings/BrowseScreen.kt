package app.swapl.features.listings

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.RoomService
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.annotation.StringRes
import app.swapl.R
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.swapl.core.model.ListingWithScore
import app.swapl.core.repository.SearchFilters
import app.swapl.design.components.DateField
import app.swapl.design.components.FavoriteHeartButton
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.MatchBadge
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import app.swapl.features.discover.ExperiencesTab
import app.swapl.features.discover.ServicesTab
import androidx.compose.ui.graphics.vector.ImageVector

private val SORT_OPTIONS = listOf(
    "match" to R.string.browse_sort_match,
    "newest" to R.string.browse_sort_newest,
    "size_desc" to R.string.browse_sort_largest,
)

// Airbnb-style section chips under the search field (DOK-145). Homes is the
// classic browse list; Experiences/Services are the env-gated affiliate
// catalogue tabs.
private enum class BrowseTab(@StringRes val label: Int, val icon: ImageVector) {
    Homes(R.string.browse_tab_homes, Icons.Default.Home),
    Experiences(R.string.browse_tab_experiences, Icons.Default.AutoAwesome),
    Services(R.string.browse_tab_services, Icons.Default.RoomService),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowseScreen(
    onOpen: (String) -> Unit = {},
    onNew: () -> Unit = {},
    onEditOwn: (String) -> Unit = {},
    onInspire: () -> Unit = {},
    vm: BrowseViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val favoriteIds by vm.favoriteIds.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }

    var showFilters by remember { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var tab by rememberSaveable { mutableStateOf(BrowseTab.Homes) }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.padding(horizontal = SwaplSpacing.s5, vertical = SwaplSpacing.s3).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.browse_title), style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
            SortMenu(current = state.filters.sort, onSelect = { vm.setSort(it) })
            val ownListingId = state.viewerListingId
            if (ownListingId != null) {
                TextButton(onClick = { onEditOwn(ownListingId) }) { Text(stringResource(R.string.browse_edit_home)) }
            } else {
                TextButton(onClick = onNew) { Text(stringResource(R.string.browse_list_home)) }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.browse_search_placeholder)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = ""; vm.setCityQuery("") }) {
                            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.browse_clear_search))
                        }
                    }
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.setCityQuery(query) }),
                shape = CircleShape,
                modifier = Modifier.weight(1f),
            )
            FilledTonalIconButton(onClick = { showFilters = true }) {
                Icon(Icons.Default.Tune, contentDescription = stringResource(R.string.browse_filters))
            }
        }
        Spacer(Modifier.height(SwaplSpacing.s2))

        // Section chips (Airbnb-style pills with icons). Homes keeps the
        // existing browse list untouched; the other two swap in the
        // affiliate catalogue tabs.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4),
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            BrowseTab.entries.forEach { t ->
                FilterChip(
                    selected = tab == t,
                    onClick = { tab = t },
                    label = { Text(stringResource(t.label)) },
                    leadingIcon = {
                        Icon(t.icon, contentDescription = null, modifier = Modifier.height(18.dp))
                    },
                    shape = CircleShape,
                )
            }
        }
        Spacer(Modifier.height(SwaplSpacing.s2))

        // "Get Inspired" (DOK-146): the AI assistant entry point. Homes only —
        // the package proposes real, active home swaps, not affiliate items.
        if (tab == BrowseTab.Homes) {
            GetInspiredBanner(onClick = onInspire)
            Spacer(Modifier.height(SwaplSpacing.s2))
        }

        when (tab) {
            BrowseTab.Experiences -> ExperiencesTab()
            BrowseTab.Services -> ServicesTab()
            BrowseTab.Homes -> PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { vm.refresh() },
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    state.error != null -> ErrorState(onRetry = { vm.refresh() })
                    state.items.isEmpty() && state.hasLoaded -> EmptyState()
                    else -> LazyColumn(
                        contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
                        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(state.items, key = { it.listing.id }) { item ->
                            ListingCard(
                                item,
                                isFavorite = item.listing.id in favoriteIds,
                                onToggleFavorite = { vm.toggleFavorite(item.listing.id) },
                                onClick = { onOpen(item.listing.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showFilters) {
        FilterSheet(
            current = state.filters,
            onDismiss = { showFilters = false },
            onApply = { showFilters = false; vm.applyFilters(it) },
        )
    }
}

// Slim tappable strip above the Homes list — opens the Get Inspired flow.
@Composable
private fun GetInspiredBanner(onClick: () -> Unit) {
    SurfaceCard(
        modifier = Modifier
            .padding(horizontal = SwaplSpacing.s4)
            .clickable(onClick = onClick),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        ) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.browse_get_inspired_title), style = MaterialTheme.typography.titleLarge)
                Text(
                    stringResource(R.string.browse_get_inspired_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private val PROPERTY_TYPES = listOf("APARTMENT", "HOUSE", "LOFT", "TOWNHOUSE")

// Material bottom-sheet take on the iOS filter controls: property type,
// minimum size/sleeps, and the three accessibility/lifestyle toggles.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterSheet(
    current: SearchFilters,
    onDismiss: () -> Unit,
    onApply: (SearchFilters) -> Unit,
) {
    var types by remember { mutableStateOf(current.propertyTypes.toSet()) }
    var minSqm by remember { mutableStateOf(current.minSqm.toFloat()) }
    var minSleeps by remember { mutableStateOf(current.minSleeps.toFloat()) }
    // Space-type filter (DOK-160): null = all; "entire_place" | "private_room".
    var spaceType by remember { mutableStateOf(current.spaceType) }
    var pets by remember { mutableStateOf(current.petsRequired) }
    var wfh by remember { mutableStateOf(current.wfhRequired) }
    var stepFree by remember { mutableStateOf(current.stepFreeRequired) }
    // Date filter (DOK-159): empty = any dates. When set, the API returns only
    // homes whose published window covers the range and that aren't already
    // booked then — integrity is enforced server-side via lib/listing/availability.
    var dateFrom by remember { mutableStateOf(current.dateFrom ?: "") }
    var dateTo by remember { mutableStateOf(current.dateTo ?: "") }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(horizontal = SwaplSpacing.s5).padding(bottom = SwaplSpacing.s8),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        ) {
            Text(stringResource(R.string.filter_title), style = MaterialTheme.typography.headlineMedium)

            KickerLabel(stringResource(R.string.filter_when))
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField(stringResource(R.string.filter_from), dateFrom, { dateFrom = it }, modifier = Modifier.weight(1f))
                DateField(stringResource(R.string.filter_to), dateTo, { dateTo = it }, modifier = Modifier.weight(1f))
            }
            if (dateFrom.isNotEmpty() || dateTo.isNotEmpty()) {
                TextButton(onClick = { dateFrom = ""; dateTo = "" }) { Text(stringResource(R.string.filter_clear_dates)) }
            }

            KickerLabel(stringResource(R.string.filter_space_type))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                val spaceOptions = listOf(
                    null to R.string.filter_space_all,
                    "entire_place" to R.string.filter_space_entire,
                    "private_room" to R.string.filter_space_private_room,
                )
                spaceOptions.forEachIndexed { index, (wire, labelRes) ->
                    SegmentedButton(
                        selected = spaceType == wire,
                        onClick = { spaceType = wire },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = spaceOptions.size),
                    ) { Text(stringResource(labelRes)) }
                }
            }

            KickerLabel(stringResource(R.string.filter_property_type))
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                PROPERTY_TYPES.forEach { t ->
                    FilterChip(
                        selected = t in types,
                        onClick = { types = if (t in types) types - t else types + t },
                        label = { Text(t.lowercase().replaceFirstChar { it.uppercase() }) },
                    )
                }
            }

            KickerLabel(stringResource(R.string.filter_min_size, minSqm.toInt()))
            Slider(value = minSqm, onValueChange = { minSqm = it }, valueRange = 30f..200f, steps = 16)

            KickerLabel(stringResource(R.string.filter_min_sleeps, minSleeps.toInt()))
            Slider(value = minSleeps, onValueChange = { minSleeps = it }, valueRange = 1f..10f, steps = 8)

            FilterSwitch(stringResource(R.string.filter_pets), pets) { pets = it }
            FilterSwitch(stringResource(R.string.filter_wfh), wfh) { wfh = it }
            FilterSwitch(stringResource(R.string.filter_step_free), stepFree) { stepFree = it }

            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = {
                        types = emptySet(); minSqm = 30f; minSleeps = 1f
                        spaceType = null
                        pets = false; wfh = false; stepFree = false
                        dateFrom = ""; dateTo = ""
                    },
                ) { Text(stringResource(R.string.filter_reset)) }
                Spacer(Modifier.weight(1f))
                PrimaryPill(
                    text = stringResource(R.string.filter_show_homes),
                    onClick = {
                        onApply(
                            current.copy(
                                propertyTypes = types.toList(),
                                spaceType = spaceType,
                                minSqm = minSqm.toInt(),
                                minSleeps = minSleeps.toInt(),
                                petsRequired = pets,
                                wfhRequired = wfh,
                                stepFreeRequired = stepFree,
                                dateFrom = dateFrom.ifBlank { null },
                                dateTo = dateTo.ifBlank { null },
                            ),
                        )
                    },
                    modifier = Modifier.weight(2f),
                )
            }
        }
    }
}

@Composable
private fun FilterSwitch(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun SortMenu(current: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = stringResource(R.string.browse_sort))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SORT_OPTIONS.forEach { (value, labelRes) ->
                DropdownMenuItem(
                    text = { Text(stringResource(labelRes)) },
                    leadingIcon = { RadioButton(selected = current == value, onClick = null) },
                    onClick = { open = false; onSelect(value) },
                )
            }
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
        Text(stringResource(R.string.browse_error_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.browse_error_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.common_retry)) }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.browse_empty_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.browse_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ListingCard(
    item: ListingWithScore,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onClick: () -> Unit,
) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Box {
                ListingPhoto(
                    photoUrl = item.listing.photos.firstOrNull(),
                    palette = item.listing.palette,
                    height = 180.dp,
                )
                FavoriteHeartButton(
                    isFavorite = isFavorite,
                    onToggle = onToggleFavorite,
                    modifier = Modifier.align(Alignment.TopEnd).padding(SwaplSpacing.s2),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${item.listing.neighbourhood} · ${item.listing.city}",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        stringResource(
                            R.string.browse_guests_size_type,
                            item.listing.sleeps,
                            item.listing.sizeSqm,
                            item.listing.propertyType.lowercase(),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                // Private-room chip (DOK-160) takes priority over band tags so a
                // room is always flagged; the match badge still wins when present.
                when {
                    item.matchScore != null -> MatchBadge(item.matchScore)
                    item.listing.isPrivateRoom -> TagChip(stringResource(R.string.browse_tag_private_room))
                    item.band == "featured" -> TagChip(stringResource(R.string.browse_tag_featured))
                    item.band == "verified" -> TagChip(stringResource(R.string.browse_tag_verified))
                }
            }
        }
    }
}
