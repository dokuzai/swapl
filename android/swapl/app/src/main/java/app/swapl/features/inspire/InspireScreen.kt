package app.swapl.features.inspire

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.DiscoverExperience
import app.swapl.core.model.InspireCandidate
import app.swapl.core.model.InspirePackage
import app.swapl.core.model.InspireService
import app.swapl.core.repository.AssistantRepository
import app.swapl.design.components.DateField
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.MatchBadge
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalette
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

// "Get Inspired" (DOK-146): free-text wish + optional dates → the assistant
// composes a swap package from REAL, active, date-compatible listings.
// Confirming creates an actual proposal through the same code path as
// POST /api/proposals (plan limits and suspension apply), then hands the
// proposal id back to the presenter, which routes to the existing thread.

data class InspireUiState(
    val isComposing: Boolean = false,
    val composeError: String? = null,
    val pkg: InspirePackage? = null,
    // Package-phase, all editable before confirm:
    val selectedId: String = "",
    val dateFrom: String = "",
    val dateTo: String = "",
    val message: String = "",
    val isConfirming: Boolean = false,
    val isDismissing: Boolean = false,
    val packageError: String? = null,
    // Terminal: a real proposal id on confirm, or dismissed.
    val confirmedProposalId: String? = null,
    val dismissed: Boolean = false,
) {
    val selected: InspireCandidate?
        get() = pkg?.allCandidates?.firstOrNull { it.listingId == selectedId } ?: pkg?.destination

    /** Everything except the current hero — tapping a card swaps the hero
     *  using data the compose call already returned (no extra request). */
    val alternatives: List<InspireCandidate>
        get() = pkg?.allCandidates?.filter { it.listingId != selectedId } ?: emptyList()
}

@HiltViewModel
class InspireViewModel @Inject constructor(
    private val repo: AssistantRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(InspireUiState())
    val state: StateFlow<InspireUiState> = _state.asStateFlow()

    fun compose(prompt: String, dateFrom: String?, dateTo: String?) {
        if (_state.value.isComposing) return
        viewModelScope.launch {
            _state.update { it.copy(isComposing = true, composeError = null) }
            try {
                val pkg = repo.inspire(
                    prompt = prompt.trim().ifEmpty { null },
                    dateFrom = dateFrom,
                    dateTo = dateTo,
                )
                _state.update {
                    it.copy(
                        isComposing = false,
                        pkg = pkg,
                        selectedId = pkg.destination.listingId,
                        dateFrom = pkg.dates.from,
                        dateTo = pkg.dates.to,
                        message = pkg.proposalMessage,
                    )
                }
            } catch (t: Throwable) {
                _state.update { it.copy(isComposing = false, composeError = friendlyError(t)) }
            }
        }
    }

    fun select(listingId: String) = _state.update { it.copy(selectedId = listingId) }
    fun setDateFrom(value: String) = _state.update { it.copy(dateFrom = value) }
    fun setDateTo(value: String) = _state.update { it.copy(dateTo = value) }
    fun setMessage(value: String) = _state.update { it.copy(message = value) }

    fun confirm() {
        val pkg = _state.value.pkg ?: return
        if (_state.value.isConfirming || _state.value.isDismissing) return
        viewModelScope.launch {
            _state.update { it.copy(isConfirming = true, packageError = null) }
            try {
                val res = repo.confirm(
                    packageId = pkg.packageId,
                    listingId = _state.value.selectedId,
                    dateFrom = _state.value.dateFrom,
                    dateTo = _state.value.dateTo,
                    message = _state.value.message.trim(),
                )
                _state.update { it.copy(isConfirming = false, confirmedProposalId = res.proposalId) }
            } catch (t: Throwable) {
                _state.update { it.copy(isConfirming = false, packageError = friendlyError(t)) }
            }
        }
    }

    fun dismissPackage() {
        val pkg = _state.value.pkg ?: return
        if (_state.value.isConfirming || _state.value.isDismissing) return
        viewModelScope.launch {
            _state.update { it.copy(isDismissing = true, packageError = null) }
            try {
                repo.dismiss(pkg.packageId)
                _state.update { it.copy(isDismissing = false, dismissed = true) }
            } catch (t: Throwable) {
                _state.update { it.copy(isDismissing = false, packageError = friendlyError(t)) }
            }
        }
    }

    fun resolveUrl(raw: String): String = repo.resolveUrl(raw)

    // The backend's coded refusals, in plain words (same tone as iOS).
    private fun friendlyError(t: Throwable): String =
        when ((t as? ResponseException)?.response?.status?.value) {
            422 -> "We need an active home of yours — and at least one compatible match — to compose a package."
            429 -> "You're dreaming fast! Give it a few minutes and try again."
            402 -> "You've reached your plan's proposal limit. Upgrade to send more."
            403 -> "Your account can't send proposals right now."
            else -> t.message ?: "Something went wrong. Please try again."
        }
}

/** onFinished: the created proposal id on confirm, null on dismiss — the
 *  presenter pops this screen and (when non-null) opens the swap thread. */
@Composable
fun InspireScreen(
    onFinished: (String?) -> Unit,
    vm: InspireViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.confirmedProposalId) {
        state.confirmedProposalId?.let { onFinished(it) }
    }
    LaunchedEffect(state.dismissed) {
        if (state.dismissed) onFinished(null)
    }

    if (state.pkg == null) {
        InspirePromptContent(state, onCompose = vm::compose)
    } else {
        PackageContent(state, vm)
    }
}

// MARK: - Phase 1: the wish

@Composable
private fun InspirePromptContent(
    state: InspireUiState,
    onCompose: (prompt: String, dateFrom: String?, dateTo: String?) -> Unit,
) {
    var prompt by rememberSaveable { mutableStateOf("") }
    var useDates by rememberSaveable { mutableStateOf(false) }
    var dateFrom by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var dateTo by rememberSaveable { mutableStateOf(LocalDate.now().plusDays(7).toString()) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text("Get Inspired", style = MaterialTheme.typography.displaySmall)
        }
        Text(
            "Tell us the trip you're dreaming about — we'll compose a swap from real homes that match yours.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedTextField(
            value = prompt,
            onValueChange = { prompt = it },
            label = { Text("Your wish") },
            placeholder = { Text("Somewhere warm with great food, walkable, good for working remotely…") },
            minLines = 3,
            maxLines = 6,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("I have dates in mind", style = MaterialTheme.typography.bodyLarge)
                Text(
                    "Otherwise we'll use your home's availability.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = useDates, onCheckedChange = { useDates = it })
        }
        if (useDates) {
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField("From", dateFrom, { dateFrom = it }, Modifier.weight(1f))
                DateField("To", dateTo, { dateTo = it }, Modifier.weight(1f))
            }
        }

        state.composeError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (state.isComposing) {
            InspireLoading()
        } else {
            PrimaryPill(
                text = "Dream up my swap",
                onClick = {
                    onCompose(
                        prompt,
                        if (useDates) dateFrom else null,
                        if (useDates) dateTo else null,
                    )
                },
            )
        }
    }
}

// Playful loading state — cycles through messages while the package composes.
@Composable
private fun InspireLoading() {
    val messages = listOf(
        "Dreaming up your swap…",
        "Matching homes to your vibe…",
        "Checking who's free when you are…",
        "Packing your virtual bags…",
    )
    var index by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(2200)
            index = (index + 1) % messages.size
        }
    }
    Column(
        Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s5),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        CircularProgressIndicator()
        Text(
            messages[index],
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// MARK: - Phase 2: the package

@Composable
private fun PackageContent(state: InspireUiState, vm: InspireViewModel) {
    val pkg = state.pkg ?: return
    val selected = state.selected ?: return
    val context = LocalContext.current

    fun openAffiliate(raw: String) {
        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(vm.resolveUrl(raw)))
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
    ) {
        Text("Your swap package", style = MaterialTheme.typography.displaySmall)

        // Hero: photo (Coil with the city-illustration fallback), match badge, why.
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Box {
                CandidatePhoto(selected, height = 240)
                Box(Modifier.align(Alignment.TopStart).padding(SwaplSpacing.s3)) {
                    MatchBadge(selected.matchScore)
                }
            }
            Column {
                Text(selected.title, style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(2.dp))
                Text(
                    if (selected.country.isEmpty()) selected.city else "${selected.city}, ${selected.country}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            selected.why?.let { why ->
                SurfaceCard {
                    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        Icon(
                            Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(why, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        // Dates — editable before confirming.
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel("Dates")
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField("From", state.dateFrom, vm::setDateFrom, Modifier.weight(1f))
                DateField("To", state.dateTo, vm::setDateTo, Modifier.weight(1f))
            }
            if (pkg.dates.source == "availability") {
                Text(
                    "Suggested from your home's availability — adjust freely.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Pre-drafted proposal message — fully editable.
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel("Your message")
            OutlinedTextField(
                value = state.message,
                onValueChange = vm::setMessage,
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            if (pkg.proposalMessageSource == "ai") {
                Text(
                    "Drafted by AI from your listing and theirs — make it yours.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Alternatives: tapping swaps the hero, no extra network call.
        if (state.alternatives.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("Or swap the pick")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    items(state.alternatives, key = { it.listingId }) { candidate ->
                        Column(
                            modifier = Modifier
                                .width(160.dp)
                                .clip(RoundedCornerShape(SwaplRadius.lg))
                                .clickable { vm.select(candidate.listingId) },
                            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                        ) {
                            CandidatePhoto(candidate, height = 110)
                            Text(
                                candidate.city,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                            )
                            Text(
                                "${candidate.matchScore}% match",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        // Affiliate enrichment — links only, no invented prices/availability.
        if (pkg.experiences.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("While you're there")
                pkg.experiences.forEach { item ->
                    ExperienceRow(item) { openAffiliate(item.url) }
                }
            }
        }
        if (pkg.services.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("Travel essentials")
                pkg.services.forEach { service ->
                    ServiceRow(service) { openAffiliate(service.url) }
                }
            }
        }

        state.packageError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        // Confirm → a REAL proposal via the same code path as POST /api/proposals.
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            if (state.isConfirming) {
                CircularProgressIndicator(modifier = Modifier.padding(SwaplSpacing.s2))
            } else {
                PrimaryPill(
                    text = "Confirm & send proposal",
                    onClick = vm::confirm,
                    enabled = !state.isDismissing,
                )
            }
            TextButton(onClick = vm::dismissPackage, enabled = !state.isConfirming && !state.isDismissing) {
                Text(
                    if (state.isDismissing) "Dismissing…" else "Not feeling it",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ExperienceRow(item: DiscoverExperience, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Icon(
                Icons.Default.AutoAwesome,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                Text(
                    "Book on ${item.partnerDisplayName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.OpenInNew,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun ServiceRow(service: InspireService, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Icon(
                serviceIcon(service.category),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                service.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Icons.AutoMirrored.Filled.OpenInNew,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

private fun serviceIcon(category: String): ImageVector = when (category) {
    "flights" -> Icons.Default.Flight
    "esim" -> Icons.Default.SimCard
    "insurance" -> Icons.Default.VerifiedUser
    else -> Icons.Default.AutoAwesome
}

// Candidate photo with the same fallback chain as the Discover cards: the
// listing's own photo when present, the brand city illustration otherwise.
@Composable
private fun CandidatePhoto(candidate: InspireCandidate, height: Int) {
    val shaped = Modifier
        .fillMaxWidth()
        .height(height.dp)
        .clip(RoundedCornerShape(SwaplRadius.lg))
    val palette = paletteFor(candidate.city)
    if (candidate.photo.isNullOrBlank()) {
        CityIllustBackdrop(palette, shaped)
    } else {
        SubcomposeAsyncImage(
            model = candidate.photo,
            contentDescription = candidate.title,
            contentScale = ContentScale.Crop,
            modifier = shaped,
            loading = { CityIllustBackdrop(palette, Modifier.fillMaxSize()) },
            error = { CityIllustBackdrop(palette, Modifier.fillMaxSize()) },
        )
    }
}

@Composable
private fun CityIllustBackdrop(palette: SwaplCityPalette, modifier: Modifier) {
    Box(modifier.background(palette.sky), contentAlignment = Alignment.Center) {
        CityIllust(palette = palette)
    }
}

// Stable per-city palette pick — FNV-1a, same constants as the iOS card and
// the Experiences tab, so all surfaces color each city identically.
private fun paletteFor(city: String): SwaplCityPalette {
    val names = listOf("warm", "cool", "rose", "sage", "dusk", "sand", "mono")
    var hash = -3750763034362895579L // FNV-1a 64-bit offset basis
    for (byte in city.lowercase().toByteArray(Charsets.UTF_8)) {
        hash = (hash xor (byte.toLong() and 0xff)) * 1099511628211L
    }
    val index = java.lang.Long.remainderUnsigned(hash, names.size.toLong()).toInt()
    return SwaplCityPalettes.forName(names[index])
}
