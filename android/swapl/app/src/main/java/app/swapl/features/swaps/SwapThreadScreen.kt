package app.swapl.features.swaps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Listing
import app.swapl.core.model.ProposalDetail
import app.swapl.core.repository.ProposalRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SwapThreadViewModel @Inject constructor(
    private val repo: ProposalRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val proposalId: String = checkNotNull(savedState["proposalId"])

    var detail by mutableStateOf<ProposalDetail?>(null); private set
    var isActing by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var isSubmittingReview by mutableStateOf(false); private set
    var reviewError by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        runCatching { detail = repo.detail(proposalId) }
            .onFailure { error = it.message }
    }

    // POST /api/agreements/{id}/review, then refresh so canReview clears.
    fun submitReview(rating: Int, text: String, onDone: () -> Unit) = viewModelScope.launch {
        val agreementId = detail?.agreement?.id ?: return@launch
        isSubmittingReview = true
        reviewError = null
        runCatching { repo.submitReview(agreementId, rating, text) }
            .onSuccess {
                detail = runCatching { repo.detail(proposalId) }.getOrNull() ?: detail
                onDone()
            }
            .onFailure { reviewError = it.message }
        isSubmittingReview = false
    }

    fun accept() = act { repo.accept(proposalId) }
    fun decline() = act { repo.decline(proposalId) }
    fun withdraw() = act { repo.withdraw(proposalId) }
    fun counter(from: String, to: String, message: String?) =
        act { repo.counter(proposalId, from, to, message) }

    private fun act(block: suspend () -> Unit) = viewModelScope.launch {
        isActing = true
        runCatching { block() }
            .onSuccess { detail = runCatching { repo.detail(proposalId) }.getOrNull() }
            .onFailure { error = it.message }
        isActing = false
    }
}

@Composable
fun SwapThreadScreen(
    onOpenProfile: (String) -> Unit = {},
    vm: SwapThreadViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val d = vm.detail
    var showCounter by remember { mutableStateOf(false) }
    var showReview by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
    ) {
        if (d != null) {
            TagChip(d.proposal.status)
            Text("${d.proposerListing.city} ⇄ ${d.targetListing.city}", style = MaterialTheme.typography.displaySmall)
            d.other.name?.let { Text("with $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }

            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                ListingThumb(d.proposerListing, modifier = Modifier.weight(1f))
                Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = SwaplColors.Pink, modifier = Modifier.align(Alignment.CenterVertically))
                ListingThumb(d.targetListing, modifier = Modifier.weight(1f))
            }

            ProposalBlock(d)

            if (d.proposal.status == "ACCEPTED" && d.agreement != null) {
                AgreedPanel(d.agreement, d.other.name ?: "your host")
            }

            // After a COMPLETED swap the server flags canReview until the
            // caller has left their (single) review — DOK-147.
            if (d.agreement?.status == "COMPLETED" && d.agreement.canReview == true) {
                LeaveReviewCard(otherName = d.other.name, onClick = { showReview = true })
            }

            TextButton(onClick = { onOpenProfile(d.other.id) }) {
                Text("View ${d.other.name ?: "host"}'s profile")
            }

            ActionRow(d, vm, onCounter = { showCounter = true })
        }
    }

    if (showReview && d != null) {
        LeaveReviewDialog(
            otherName = d.other.name,
            isSubmitting = vm.isSubmittingReview,
            error = vm.reviewError,
            onDismiss = { showReview = false },
            onSubmit = { rating, text ->
                vm.submitReview(rating, text) { showReview = false }
            },
        )
    }

    if (showCounter) {
        CounterDialog(
            onDismiss = { showCounter = false },
            onSubmit = { from, to, msg ->
                showCounter = false
                vm.counter(from, to, msg)
            },
        )
    }
}

@Composable
private fun ListingThumb(l: Listing, modifier: Modifier = Modifier) {
    SurfaceCard(modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            ListingPhoto(photoUrl = l.photos.firstOrNull(), palette = l.palette, height = 90.dp())
            Text("${l.neighbourhood} · ${l.city}", style = MaterialTheme.typography.titleLarge)
            Text("${l.sizeSqm} m² · sleeps ${l.sleeps}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ProposalBlock(d: ProposalDetail) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel("Proposal")
            Text("${d.proposal.dateFrom.take(10)} → ${d.proposal.dateTo.take(10)}", style = MaterialTheme.typography.titleLarge)
            d.proposal.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            if (d.proposal.counterDateFrom != null && d.proposal.counterDateTo != null) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                KickerLabel("Counter")
                Text("${d.proposal.counterDateFrom.take(10)} → ${d.proposal.counterDateTo.take(10)}", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Pink)
                d.proposal.counterMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
}

// AgreedPanel (key codes + insurance) lives in AgreementPanel.kt — shared
// with the Trips detail screen.

@Composable
private fun ActionRow(d: ProposalDetail, vm: SwapThreadViewModel, onCounter: () -> Unit) {
    val canRespond = d.proposal.status == "PENDING" || d.proposal.status == "COUNTERED"
    val isTarget = d.proposal.meSide == "target"
    val isProposer = d.proposal.meSide == "proposer"

    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        if (canRespond && isTarget) {
            PrimaryPill("Accept swap", onClick = { vm.accept() }, enabled = !vm.isActing)
            TextButton(onClick = onCounter) { Text("Counter-offer") }
            TextButton(onClick = { vm.decline() }) { Text("Decline", color = MaterialTheme.colorScheme.error) }
        }
        if (canRespond && isProposer) {
            TextButton(onClick = { vm.withdraw() }) { Text("Withdraw") }
            TextButton(onClick = onCounter) { Text("Counter-offer") }
        }
    }
}

@Composable
private fun CounterDialog(onDismiss: () -> Unit, onSubmit: (String, String, String?) -> Unit) {
    val today = java.time.LocalDate.now()
    val fmt = java.time.format.DateTimeFormatter.ISO_LOCAL_DATE
    var from by remember { mutableStateOf(today.plusDays(30).format(fmt)) }
    var to by remember { mutableStateOf(today.plusDays(37).format(fmt)) }
    var msg by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Counter-offer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                app.swapl.design.components.DateField("From", from, { from = it }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
                app.swapl.design.components.DateField("To", to, { to = it }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
                OutlinedTextField(msg, { msg = it }, label = { Text("Message (optional)") }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(
                enabled = from.length == 10 && to.length == 10 && to > from,
                onClick = { onSubmit(from, to, msg.ifBlank { null }) }
            ) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
