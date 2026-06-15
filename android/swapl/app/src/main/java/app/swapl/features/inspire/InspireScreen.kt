package app.swapl.features.inspire

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.VerifiedUser
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.R
import dagger.hilt.android.qualifiers.ApplicationContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.InspireAddOnItem
import app.swapl.core.model.InspireCandidate
import app.swapl.core.model.InspireExperienceItem
import app.swapl.core.model.InspirePackage
import app.swapl.core.model.InspireServiceItem
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
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Currency
import javax.inject.Inject

// "Get Inspired" (DOK-146, extended by DOK-148): free-text wish (typed or
// dictated) + optional dates → the assistant composes a swap package from
// REAL, active, date-compatible listings. Every package item is individually
// toggleable (PATCH …/items); the ONLY payable items are the swapl concierge
// add-ons — affiliate experiences/services stay partner links, never charged
// by us. Confirming creates an actual proposal through the same code path as
// POST /api/proposals; when there are payable items and Stripe is configured
// server-side, a SetupIntent saves the card first (Custom Tab on the same web
// payment page iOS uses) — NOTHING is charged until the host accepts.

data class InspireUiState(
    val isComposing: Boolean = false,
    val composeError: String? = null,
    val pkg: InspirePackage? = null,
    // Package-phase, all editable before confirm:
    val selectedId: String = "",
    val dateFrom: String = "",
    val dateTo: String = "",
    val message: String = "",
    // Editable items (DOK-148) — mutable copies of the package's items; each
    // toggle is optimistic, then PATCHed, and reverted if the server refuses.
    val experiences: List<InspireExperienceItem> = emptyList(),
    val services: List<InspireServiceItem> = emptyList(),
    val addOns: List<InspireAddOnItem> = emptyList(),
    // Pay-on-accept checkout (DOK-148): set when POST …/checkout answers
    // { paymentRequired: true } — drives the "Payment & reservation" step.
    val checkout: AssistantRepository.CheckoutResponse? = null,
    // True while the Custom Tab with the web payment page is (presumably)
    // in front — the next ON_RESUME continues the confirm.
    val awaitingPaymentReturn: Boolean = false,
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

    // Payable = selected concierge add-ons only. Affiliate experiences and
    // services stay partner links — never charged by us, never in the total.
    val payableAddOns: List<InspireAddOnItem>
        get() = addOns.filter { it.selected && it.priceCents > 0 }
    val payableTotalCents: Int get() = payableAddOns.sumOf { it.priceCents }
    val payableCurrency: String get() = payableAddOns.firstOrNull()?.currency ?: "EUR"

    /** What the assistant understood from the (possibly spoken) prompt —
     *  same composition as the web/iOS "Understood: …" box. */
    val understood: String?
        get() {
            val f = pkg?.interpreted ?: return null
            val parts = mutableListOf<String>()
            f.city?.let { parts.add(it) }
            if (f.dateFrom != null && f.dateTo != null) {
                parts.add("${f.dateFrom} → ${f.dateTo}")
            } else if (f.dateFrom != null) {
                parts.add("From ${f.dateFrom}")
            }
            for (c in f.constraints.orEmpty()) {
                when (c) {
                    "pet-friendly" -> parts.add("pet-friendly")
                    "wfh" -> parts.add("remote-work ready")
                    "step-free" -> parts.add("step-free")
                }
            }
            return if (parts.isEmpty()) null else parts.joinToString(" · ")
        }
}

@HiltViewModel
class InspireViewModel @Inject constructor(
    private val repo: AssistantRepository,
    @ApplicationContext private val appContext: android.content.Context,
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
                        experiences = pkg.experiences,
                        services = pkg.services,
                        addOns = pkg.addOns,
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

    /** Optimistic toggle: flip locally, PATCH …/items, revert on failure. */
    fun toggleItem(itemId: String, selected: Boolean) {
        val pkg = _state.value.pkg ?: return
        setItemSelected(itemId, selected)
        viewModelScope.launch {
            try {
                repo.updateItems(pkg.packageId, listOf(AssistantRepository.ItemToggle(itemId, selected)))
            } catch (t: Throwable) {
                setItemSelected(itemId, !selected)
                _state.update { it.copy(packageError = friendlyError(t)) }
            }
        }
    }

    private fun setItemSelected(itemId: String, selected: Boolean) = _state.update { s ->
        s.copy(
            packageError = null,
            experiences = s.experiences.map { if (it.id == itemId) it.copy(selected = selected) else it },
            services = s.services.map { if (it.id == itemId) it.copy(selected = selected) else it },
            addOns = s.addOns.map { if (it.id == itemId) it.copy(selected = selected) else it },
        )
    }

    /** Confirm, phase 1 — ask the checkout route whether a payment step is
     *  needed. Env-gated degrade: no Stripe server-side or zero payable items
     *  → { paymentRequired: false } and the proposal is sent right away. */
    fun startConfirm() {
        val pkg = _state.value.pkg ?: return
        if (_state.value.isConfirming || _state.value.isDismissing) return
        viewModelScope.launch {
            _state.update { it.copy(isConfirming = true, packageError = null) }
            // Checkout is best-effort: confirm never blocks on payment, so a
            // failed checkout call degrades to the plain confirm.
            val checkout = runCatching { repo.checkout(pkg.packageId) }.getOrNull()
            if (checkout?.paymentRequired == true) {
                _state.update { it.copy(isConfirming = false, checkout = checkout) }
            } else {
                confirmNow()
            }
        }
    }

    /** Confirm, phase 2 — create the REAL proposal (same path as
     *  POST /api/proposals). If a card was saved on the web payment page, the
     *  server recovers it; with no card nothing will ever be charged. */
    fun confirm() {
        if (_state.value.isConfirming || _state.value.isDismissing) return
        viewModelScope.launch {
            _state.update { it.copy(isConfirming = true, packageError = null) }
            confirmNow()
        }
    }

    private suspend fun confirmNow() {
        val pkg = _state.value.pkg ?: return
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

    /** The Custom Tab with the web payment page is being opened. */
    fun markAwaitingPaymentReturn() = _state.update { it.copy(awaitingPaymentReturn = true) }

    /** Back from the Custom Tab (ON_RESUME): a short grace beat for the
     *  SetupIntent webhook, then confirm — the server recovers the saved
     *  payment method directly if the webhook hasn't landed yet, and with no
     *  card saved the proposal still goes out (nothing can ever be charged). */
    fun onReturnedFromPayment() {
        if (!_state.value.awaitingPaymentReturn) return
        if (_state.value.isConfirming || _state.value.isDismissing) return
        viewModelScope.launch {
            _state.update { it.copy(awaitingPaymentReturn = false, isConfirming = true, packageError = null) }
            delay(800)
            confirmNow()
        }
    }

    /** "Back to package" from the payment step. */
    fun cancelPayment() = _state.update { it.copy(checkout = null, awaitingPaymentReturn = false) }

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
    fun webPaymentUrl(): String? = _state.value.pkg?.let { repo.webPaymentUrl(it.packageId) }

    // The backend's coded refusals, in plain words (same tone as iOS).
    private fun friendlyError(t: Throwable): String =
        when ((t as? ResponseException)?.response?.status?.value) {
            422 -> appContext.getString(R.string.inspire_err_no_match)
            429 -> appContext.getString(R.string.inspire_err_rate)
            402 -> appContext.getString(R.string.inspire_err_limit)
            403 -> appContext.getString(R.string.inspire_err_forbidden)
            else -> t.message ?: appContext.getString(R.string.inspire_err_generic)
        }
}

/** Formats integer cents in the add-on's own currency. */
internal fun inspireMoney(cents: Int, currency: String): String = runCatching {
    NumberFormat.getCurrencyInstance().apply {
        this.currency = Currency.getInstance(currency)
    }.format(cents / 100.0)
}.getOrElse { "${"%.2f".format(cents / 100.0)} $currency" }

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

    when {
        state.pkg == null -> InspirePromptContent(state, onCompose = vm::compose)
        state.checkout != null -> PaymentStepContent(state, vm)
        else -> PackageContent(state, vm)
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

    // Voice input (DOK-148): the device's SpeechRecognizer transcribes into
    // the prompt field — live partials compose onto whatever was already
    // typed when the mic was tapped. No audio ever reaches Swapl's servers.
    val context = LocalContext.current
    val speechAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }
    var isRecording by remember { mutableStateOf(false) }
    var voiceDenied by remember { mutableStateOf(false) }
    var promptBase by remember { mutableStateOf("") }
    val recognizer = remember {
        if (speechAvailable) SpeechRecognizer.createSpeechRecognizer(context) else null
    }
    DisposableEffect(recognizer) {
        onDispose { recognizer?.destroy() }
    }

    fun applyTranscript(bundle: Bundle?) {
        val text = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()?.trim().orEmpty()
        if (text.isNotEmpty()) prompt = if (promptBase.isEmpty()) text else "$promptBase $text"
    }

    fun startListening() {
        val rec = recognizer ?: return
        promptBase = prompt.trim()
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) = applyTranscript(partialResults)
            override fun onResults(results: Bundle?) {
                applyTranscript(results)
                isRecording = false
            }

            override fun onError(error: Int) {
                isRecording = false
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) voiceDenied = true
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        rec.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            },
        )
        isRecording = true
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startListening() else voiceDenied = true
    }

    fun toggleMic() {
        if (isRecording) {
            recognizer?.stopListening()
            isRecording = false
            return
        }
        voiceDenied = false
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) startListening() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.inspire_title), style = MaterialTheme.typography.displaySmall)
        }
        Text(
            stringResource(R.string.inspire_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedTextField(
            value = prompt,
            onValueChange = { prompt = it },
            label = { Text(stringResource(R.string.inspire_wish_label)) },
            placeholder = { Text(stringResource(R.string.inspire_wish_placeholder)) },
            minLines = 3,
            maxLines = 6,
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = if (speechAvailable) {
                {
                    IconButton(
                        onClick = { toggleMic() },
                        enabled = !state.isComposing,
                    ) {
                        Icon(
                            Icons.Default.Mic,
                            contentDescription = if (isRecording) stringResource(R.string.inspire_mic_stop) else stringResource(R.string.inspire_mic_start),
                            tint = if (isRecording) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            } else {
                null
            },
        )
        if (isRecording) {
            Text(
                stringResource(R.string.inspire_listening),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        } else if (voiceDenied) {
            Text(
                stringResource(R.string.inspire_mic_denied),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.inspire_dates_in_mind), style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(R.string.inspire_dates_in_mind_sub),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = useDates, onCheckedChange = { useDates = it })
        }
        if (useDates) {
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField(stringResource(R.string.tw_date_from), dateFrom, { dateFrom = it }, Modifier.weight(1f))
                DateField(stringResource(R.string.tw_date_to), dateTo, { dateTo = it }, Modifier.weight(1f))
            }
        }

        state.composeError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (state.isComposing) {
            InspireLoading()
        } else {
            PrimaryPill(
                text = stringResource(R.string.inspire_dream_up),
                onClick = {
                    if (isRecording) {
                        recognizer?.stopListening()
                        isRecording = false
                    }
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
        stringResource(R.string.inspire_loading_1),
        stringResource(R.string.inspire_loading_2),
        stringResource(R.string.inspire_loading_3),
        stringResource(R.string.inspire_loading_4),
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
        Text(stringResource(R.string.inspire_package_title), style = MaterialTheme.typography.displaySmall)

        // "Understood: …" — the structured filters parsed from the (possibly
        // spoken) prompt, copy-aligned with web and iOS.
        state.understood?.let { understood ->
            SurfaceCard {
                Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    Icon(
                        Icons.Default.GraphicEq,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        stringResource(R.string.inspire_understood, understood),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

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
            KickerLabel(stringResource(R.string.inspire_dates_label))
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2), modifier = Modifier.fillMaxWidth()) {
                DateField(stringResource(R.string.tw_date_from), state.dateFrom, vm::setDateFrom, Modifier.weight(1f))
                DateField(stringResource(R.string.tw_date_to), state.dateTo, vm::setDateTo, Modifier.weight(1f))
            }
            if (pkg.dates.source == "availability") {
                Text(
                    stringResource(R.string.inspire_dates_suggested),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Pre-drafted proposal message — fully editable.
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel(stringResource(R.string.inspire_message_label))
            OutlinedTextField(
                value = state.message,
                onValueChange = vm::setMessage,
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            if (pkg.proposalMessageSource == "ai") {
                Text(
                    stringResource(R.string.inspire_message_ai),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Alternatives: tapping swaps the hero, no extra network call.
        if (state.alternatives.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel(stringResource(R.string.inspire_swap_pick))
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
                                stringResource(R.string.inspire_match_pct, candidate.matchScore),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        // Affiliate enrichment — links only, individually toggleable (the
        // PATCH happens in the view model and reverts on failure). Never
        // charged by us, never in the payable total.
        if (state.experiences.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel(stringResource(R.string.inspire_while_there))
                state.experiences.forEach { item ->
                    ExperienceRow(
                        item = item,
                        onOpen = { openAffiliate(item.url) },
                        onToggle = { vm.toggleItem(item.id, !item.selected) },
                    )
                }
                Text(
                    stringResource(R.string.inspire_experiences_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (state.services.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel(stringResource(R.string.inspire_travel_essentials))
                state.services.forEach { service ->
                    ServiceRow(
                        service = service,
                        onOpen = { openAffiliate(service.url) },
                        onToggle = { vm.toggleItem(service.id, !service.selected) },
                    )
                }
            }
        }

        // swapl concierge add-ons — the ONLY payable items in the package.
        if (state.addOns.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel(stringResource(R.string.inspire_concierge_addons))
                state.addOns.forEach { addOn ->
                    AddOnRow(
                        addOn = addOn,
                        onToggle = { vm.toggleItem(addOn.id, !addOn.selected) },
                    )
                }
                Text(
                    stringResource(R.string.inspire_addons_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Running total of the payable items — recomputed locally on every
        // optimistic toggle, copy-aligned with web and iOS.
        SurfaceCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (state.payableTotalCents > 0) {
                    Text(
                        stringResource(R.string.inspire_payable_if_accepts),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        inspireMoney(state.payableTotalCents, state.payableCurrency),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                    )
                } else {
                    Text(
                        stringResource(R.string.inspire_nothing_payable),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        state.packageError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        // Confirm → checkout first (payment step only when needed), then a
        // REAL proposal via the same code path as POST /api/proposals.
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            if (state.isConfirming) {
                CircularProgressIndicator(modifier = Modifier.padding(SwaplSpacing.s2))
            } else {
                PrimaryPill(
                    text = stringResource(R.string.inspire_confirm_send),
                    onClick = vm::startConfirm,
                    enabled = !state.isDismissing,
                )
            }
            if (state.payableTotalCents > 0) {
                Text(
                    stringResource(R.string.inspire_charged_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = SwaplSpacing.s2),
                )
            }
            TextButton(onClick = vm::dismissPackage, enabled = !state.isConfirming && !state.isDismissing) {
                Text(
                    if (state.isDismissing) stringResource(R.string.inspire_dismissing) else stringResource(R.string.inspire_not_feeling),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// MARK: - Phase 3: payment & reservation (DOK-148)

// Shown ONLY when POST …/checkout answered { paymentRequired: true }. No
// native Stripe SDK: "Save card" opens the same web payment page iOS uses
// ({origin}/inspire?package={id}&step=pay, Stripe Payment Element) in a
// Custom Tab. The SetupIntent there only SAVES the card — the off-session
// charge is created when (and only when) the host accepts the proposal.
// Returning to the app (ON_RESUME) continues the confirm either way: the
// server recovers the saved payment method, and with no card saved the
// proposal still goes out.
@Composable
private fun PaymentStepContent(state: InspireUiState, vm: InspireViewModel) {
    val checkout = state.checkout ?: return
    val context = LocalContext.current

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        vm.onReturnedFromPayment()
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
            KickerLabel(stringResource(R.string.inspire_almost_there))
            Text(stringResource(R.string.inspire_payment_title), style = MaterialTheme.typography.displaySmall)
        }

        SurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel(stringResource(R.string.inspire_your_selection))
                checkout.summary.payableItems.forEach { line ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            line.name,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            inspireMoney(line.priceCents, checkout.summary.currency),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.inspire_payable_if_accepts),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        inspireMoney(checkout.summary.totalCents, checkout.summary.currency),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        SurfaceCard {
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    checkout.note ?: stringResource(R.string.inspire_charged_note),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        Text(
            stringResource(R.string.inspire_partner_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.packageError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            if (state.isConfirming) {
                CircularProgressIndicator(modifier = Modifier.padding(SwaplSpacing.s2))
            } else {
                PrimaryPill(
                    text = stringResource(R.string.inspire_save_card),
                    onClick = {
                        // Same web payment page iOS opens — Stripe Payment
                        // Element saves the card; coming back resumes confirm.
                        val url = vm.webPaymentUrl() ?: return@PrimaryPill
                        vm.markAwaitingPaymentReturn()
                        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
                    },
                )
                // The card is optional by design: the proposal can go out with
                // nothing saved — then nothing can ever be charged.
                TextButton(onClick = vm::confirm) {
                    Text(stringResource(R.string.inspire_send_no_card), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = vm::cancelPayment) {
                    Text(stringResource(R.string.inspire_back_to_package), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// MARK: - item rows

/** Add/remove toggle for a package item — optimistic; the PATCH happens in
 *  the view model and reverts on failure. */
@Composable
private fun ItemToggleButton(selected: Boolean, name: String, onToggle: () -> Unit) {
    IconButton(onClick = onToggle) {
        Icon(
            if (selected) Icons.Default.CheckCircle else Icons.Default.AddCircleOutline,
            contentDescription = if (selected) "Remove $name from the package" else "Include $name in the package",
            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ExperienceRow(item: InspireExperienceItem, onOpen: () -> Unit, onToggle: () -> Unit) {
    SurfaceCard(modifier = Modifier.alpha(if (item.selected) 1f else 0.55f)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onOpen),
            ) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Column(Modifier.weight(1f)) {
                    Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    Text(
                        stringResource(R.string.inspire_book_on, item.partnerDisplayName),
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
            ItemToggleButton(item.selected, item.title, onToggle)
        }
    }
}

@Composable
private fun ServiceRow(service: InspireServiceItem, onOpen: () -> Unit, onToggle: () -> Unit) {
    SurfaceCard(modifier = Modifier.alpha(if (service.selected) 1f else 0.55f)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onOpen),
            ) {
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
            ItemToggleButton(service.selected, service.name, onToggle)
        }
    }
}

@Composable
private fun AddOnRow(addOn: InspireAddOnItem, onToggle: () -> Unit) {
    SurfaceCard(modifier = Modifier.alpha(if (addOn.selected) 1f else 0.55f)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Icon(
                Icons.Default.Notifications,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(Modifier.weight(1f)) {
                Text(addOn.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                if (addOn.description.isNotEmpty()) {
                    Text(
                        addOn.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
            }
            Text(
                inspireMoney(addOn.priceCents, addOn.currency),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            ItemToggleButton(addOn.selected, addOn.name, onToggle)
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
