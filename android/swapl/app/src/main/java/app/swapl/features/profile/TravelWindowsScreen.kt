package app.swapl.features.profile

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.TravelWindow
import app.swapl.core.model.WindowProposal
import app.swapl.core.repository.TravelWindowRepository
import app.swapl.design.components.DateField
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalette
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import javax.inject.Inject

// Travel windows editor (DOK-161) — speculative with web and iOS. Add/remove
// "I want to travel around these dates" intents with optional destinations +
// notes, a live counter, and an upsell when the create POST returns 402 (the
// server's plan-cap copy is shown verbatim). Each window expands into its AI
// proposals — real homes free for the exact dates — each with a match badge,
// the swap modes it supports (direct swap / Stay-with-Keys), and a tap-through
// to the listing. Mirrors app/app/account/travel-windows/editor.tsx and
// ios/Swapl/Features/Profile/TravelWindowsView.swift.

data class TravelWindowsUiState(
    val items: List<TravelWindow> = emptyList(),
    val hasLoaded: Boolean = false,
    val error: String? = null,
    // Upsell copy from a 402 on create — surfaced verbatim (it carries the
    // member's current plan + cap), cleared on any successful create/delete.
    val upsell: String? = null,
    val isCreating: Boolean = false,
    val isAdding: Boolean = false,
)

@HiltViewModel
class TravelWindowsViewModel @Inject constructor(
    private val repo: TravelWindowRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TravelWindowsUiState())
    val state: StateFlow<TravelWindowsUiState> = _state.asStateFlow()

    fun load() = viewModelScope.launch {
        try {
            val items = repo.list()
            _state.update { it.copy(items = items, hasLoaded = true, error = null) }
        } catch (t: Throwable) {
            _state.update { it.copy(hasLoaded = true, error = t.message ?: "Couldn't load your travel windows.") }
        }
    }

    fun setAdding(value: Boolean) = _state.update { it.copy(isAdding = value, error = null) }

    /** Returns true on success so the sheet can close. On a 402 the upsell is
     *  set and the sheet also closes so the member sees it on the list. */
    fun create(
        dateFrom: String,
        dateTo: String,
        flexible: Boolean,
        destinations: List<String>,
        notes: String,
    ) = viewModelScope.launch {
        _state.update { it.copy(isCreating = true, error = null) }
        try {
            val window = repo.create(dateFrom, dateTo, flexible, destinations, notes.trim())
            _state.update {
                it.copy(
                    items = (it.items + window).sortedBy { w -> w.dateFrom },
                    isCreating = false,
                    isAdding = false,
                    upsell = null,
                )
            }
        } catch (t: ClientRequestException) {
            if (t.response.status.value == 402) {
                _state.update { it.copy(isCreating = false, isAdding = false, upsell = upsellCopy(t)) }
            } else {
                _state.update { it.copy(isCreating = false, error = t.message ?: "Couldn't save this travel window.") }
            }
        } catch (t: Throwable) {
            _state.update { it.copy(isCreating = false, error = t.message ?: "Couldn't save this travel window.") }
        }
    }

    /** Optimistic delete: drop locally, restore on failure. */
    fun delete(window: TravelWindow) {
        val snapshot = _state.value.items
        _state.update { it.copy(items = it.items.filterNot { w -> w.id == window.id }, upsell = null) }
        viewModelScope.launch {
            try {
                repo.delete(window.id)
            } catch (t: Throwable) {
                _state.update { it.copy(items = snapshot, error = t.message ?: "Couldn't remove this window.") }
            }
        }
    }

    // The 402 body is { error, upgradeTo, currentPlan } — surface `error`
    // verbatim (it's the plan-cap upsell copy), same as iOS.
    private suspend fun upsellCopy(t: ClientRequestException): String =
        runCatching {
            val body = Json.parseToJsonElement(t.response.bodyAsText()).jsonObject
            body["error"]?.jsonPrimitive?.content
        }.getOrNull() ?: "You've reached your plan's travel-window limit. Upgrade to save more."
}

@Composable
fun TravelWindowsScreen(
    onOpenListing: (String) -> Unit = {},
    vm: TravelWindowsViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Header(count = state.items.size)

        state.upsell?.let { reason ->
            SurfaceCard {
                KickerLabel("Plus / Pro")
                Spacer(Modifier.height(SwaplSpacing.s1))
                Text(
                    "You've reached your plan's travel-window limit",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(SwaplSpacing.s1))
                Text(reason, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        state.error?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (state.isAdding) {
            AddTravelWindowCard(state = state, onSave = vm::create, onCancel = { vm.setAdding(false) })
        } else {
            PrimaryPill(text = "Add a travel window", onClick = { vm.setAdding(true) })
        }

        if (state.items.isEmpty() && state.hasLoaded && !state.isAdding) {
            SurfaceCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f)) {
                        Text("No travel windows yet", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Tell us when you'd like to travel — we'll bring you ready-made swaps for those dates.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            state.items.forEach { window ->
                TravelWindowCard(
                    window = window,
                    onRemove = { vm.delete(window) },
                    onOpenListing = onOpenListing,
                )
            }
        }
    }
}

@Composable
private fun Header(count: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                if (count == 0) "When do you want to go?" else "$count saved",
                style = MaterialTheme.typography.displaySmall,
            )
        }
        Text(
            "Save the dates you're dreaming about. The assistant composes swaps from real homes that are free exactly then.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// MARK: - Add editor

@Composable
private fun AddTravelWindowCard(
    state: TravelWindowsUiState,
    onSave: (dateFrom: String, dateTo: String, flexible: Boolean, destinations: List<String>, notes: String) -> Unit,
    onCancel: () -> Unit,
) {
    var dateFrom by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var dateTo by rememberSaveable { mutableStateOf(LocalDate.now().plusDays(7).toString()) }
    var flexible by rememberSaveable { mutableStateOf(false) }
    var destinations by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }

    val validRange = dateTo > dateFrom

    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            KickerLabel("New travel window")

            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField("From", dateFrom, { dateFrom = it }, Modifier.weight(1f))
                DateField("To", dateTo, { dateTo = it }, Modifier.weight(1f))
            }
            if (!validRange) {
                Text(
                    "Your end date must be after the start date.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text("My dates are flexible", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "We'll widen the search around these days.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = flexible, onCheckedChange = { flexible = it })
            }

            OutlinedTextField(
                value = destinations,
                onValueChange = { destinations = it },
                label = { Text("Where to? (optional)") },
                placeholder = { Text("Lisbon, Portugal, Barcelona") },
                singleLine = false,
                maxLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                "Comma-separated cities or countries — leave empty for anywhere.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notes (optional)") },
                placeholder = { Text("Anniversary trip, want somewhere walkable…") },
                minLines = 2,
                maxLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )

            if (state.isCreating) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.padding(SwaplSpacing.s2))
                }
            } else {
                PrimaryPill(
                    text = "Save travel window",
                    enabled = validRange,
                    onClick = {
                        val dests = destinations.split(",").map { it.trim() }.filter { it.isNotEmpty() }
                        onSave(dateFrom, dateTo, flexible, dests, notes)
                    },
                )
                TextButton(onClick = onCancel, enabled = !state.isCreating) {
                    Text("Cancel", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// MARK: - Window card

@Composable
private fun TravelWindowCard(
    window: TravelWindow,
    onRemove: () -> Unit,
    onOpenListing: (String) -> Unit,
) {
    var showingProposals by rememberSaveable(window.id) { mutableStateOf(false) }

    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                    Text(
                        "${window.dateFrom} → ${window.dateTo}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        if (window.flexible) {
                            Text(
                                "Flexible",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(SwaplRadius.lg))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .padding(horizontal = SwaplSpacing.s2, vertical = 3.dp),
                            )
                        }
                        Text(
                            window.destinations.takeIf { it.isNotEmpty() }?.joinToString(" · ") ?: "Anywhere",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                    window.notes?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = onRemove) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove this travel window",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            HorizontalDivider()

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(SwaplRadius.md))
                    .clickable { showingProposals = !showingProposals }
                    .padding(vertical = SwaplSpacing.s1),
            ) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    if (showingProposals) "Hide swaps for these dates" else "Show swaps for these dates",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .size(18.dp)
                        .rotate(if (showingProposals) 180f else 0f),
                )
            }

            AnimatedVisibility(visible = showingProposals) {
                WindowProposalsSection(windowId = window.id, onOpenListing = onOpenListing)
            }
        }
    }
}

// MARK: - Proposals

private sealed interface ProposalsState {
    data object Loading : ProposalsState
    data object NoListing : ProposalsState
    data class Error(val message: String) : ProposalsState
    data class Ready(val proposals: List<WindowProposal>) : ProposalsState
}

@Composable
private fun WindowProposalsSection(
    windowId: String,
    onOpenListing: (String) -> Unit,
) {
    val repo = rememberProposalsRepo()
    var state by remember(windowId) { mutableStateOf<ProposalsState>(ProposalsState.Loading) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(windowId) {
        state = ProposalsState.Loading
        scope.launch {
            state = try {
                val result = repo.proposals(windowId)
                ProposalsState.Ready(result.proposals)
            } catch (t: ClientRequestException) {
                if (t.response.status.value == 409 && t.response.bodyAsText().contains("NO_ACTIVE_LISTING")) {
                    ProposalsState.NoListing
                } else {
                    ProposalsState.Error(t.message ?: "Couldn't load swaps.")
                }
            } catch (t: Throwable) {
                ProposalsState.Error(t.message ?: "Couldn't load swaps.")
            }
        }
    }

    Column(
        Modifier.fillMaxWidth().padding(top = SwaplSpacing.s2),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        when (val s = state) {
            is ProposalsState.Loading -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            ) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
                Text(
                    "Finding homes free for your dates…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            is ProposalsState.NoListing -> Text(
                "Add an active listing first — a swap needs two homes.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            is ProposalsState.Error -> Text(
                s.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )

            is ProposalsState.Ready -> if (s.proposals.isEmpty()) {
                Text(
                    "Nothing free for these exact dates yet — we'll keep watching and email you when a match appears.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                s.proposals.forEach { proposal ->
                    WindowProposalCard(proposal = proposal, onOpen = { onOpenListing(proposal.listingId) })
                }
            }
        }
    }
}

// The proposals fetch is a lightweight, per-card concern; rather than minting a
// dedicated view model per window, we reach the repository through a tiny Hilt
// holder so the section stays self-contained.
@HiltViewModel
class ProposalsRepoHolder @Inject constructor(val repo: TravelWindowRepository) : ViewModel()

@Composable
private fun rememberProposalsRepo(): TravelWindowRepository =
    hiltViewModel<ProposalsRepoHolder>().repo

@Composable
private fun WindowProposalCard(proposal: WindowProposal, onOpen: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SwaplRadius.lg))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onOpen),
    ) {
        Box {
            ProposalPhoto(proposal)
            Text(
                "${proposal.matchScore}% match",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(SwaplSpacing.s2)
                    .clip(RoundedCornerShape(SwaplRadius.lg))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = SwaplSpacing.s2, vertical = 4.dp),
            )
        }
        Column(
            Modifier.padding(SwaplSpacing.s3),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            Text(proposal.locationText, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            if (proposal.matchesDestination) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                    Text(
                        "On your wishlist destinations",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            if (proposal.why.isNotBlank()) {
                Text(proposal.why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                if (proposal.modes.directSwap) {
                    ModeChip("Direct swap", Icons.Default.SwapHoriz, filled = true)
                }
                if (proposal.modes.keysStay) {
                    val keys = proposal.nightlyKeys?.takeIf { it > 0 }?.let { " · $it Keys/night" } ?: ""
                    ModeChip("Stay with Keys$keys", Icons.Default.Key, filled = false)
                }
            }
        }
    }
}

@Composable
private fun ModeChip(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, filled: Boolean) {
    val bg = if (filled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
    val fg = if (filled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
        modifier = Modifier
            .clip(RoundedCornerShape(SwaplRadius.lg))
            .background(bg)
            .padding(horizontal = SwaplSpacing.s2, vertical = 5.dp),
    ) {
        Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(13.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = fg)
    }
}

@Composable
private fun ProposalPhoto(proposal: WindowProposal) {
    val shaped = Modifier
        .fillMaxWidth()
        .height(150.dp)
    val palette = paletteFor(proposal.city)
    if (proposal.photo.isNullOrBlank()) {
        CityBackdrop(palette, shaped)
    } else {
        SubcomposeAsyncImage(
            model = proposal.photo,
            contentDescription = proposal.title,
            contentScale = ContentScale.Crop,
            modifier = shaped,
            loading = { CityBackdrop(palette, Modifier.fillMaxSize()) },
            error = { CityBackdrop(palette, Modifier.fillMaxSize()) },
        )
    }
}

@Composable
private fun CityBackdrop(palette: SwaplCityPalette, modifier: Modifier) {
    Box(modifier.background(palette.sky), contentAlignment = Alignment.Center) {
        CityIllust(palette = palette)
    }
}

// Stable per-city palette pick — FNV-1a, same constants as the Inspire card so
// every surface colors a city identically.
private fun paletteFor(city: String): SwaplCityPalette {
    val names = listOf("warm", "cool", "rose", "sage", "dusk", "sand", "mono")
    var hash = -3750763034362895579L
    for (byte in city.lowercase().toByteArray(Charsets.UTF_8)) {
        hash = (hash xor (byte.toLong() and 0xff)) * 1099511628211L
    }
    val index = java.lang.Long.remainderUnsigned(hash, names.size.toLong()).toInt()
    return SwaplCityPalettes.forName(names[index])
}
