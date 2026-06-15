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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.res.stringResource
import app.swapl.R
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
import app.swapl.design.components.StatusTagChip
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

    // One-shot success signal (string res id) surfaced as a snackbar after a
    // successful accept/decline/withdraw/counter (M4). Cleared once shown.
    var successMessageRes by mutableStateOf<Int?>(null); private set

    fun consumeSuccess() { successMessageRes = null }
    fun clearError() { error = null }

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

    fun accept() = act(R.string.thread_accepted_toast) { repo.accept(proposalId) }
    fun decline() = act(R.string.thread_declined_toast) { repo.decline(proposalId) }
    fun withdraw() = act(R.string.thread_withdrawn_toast) { repo.withdraw(proposalId) }
    fun counter(from: String, to: String, message: String?) =
        act(R.string.thread_countered_toast) { repo.counter(proposalId, from, to, message) }

    private fun act(successRes: Int, block: suspend () -> Unit) = viewModelScope.launch {
        isActing = true
        error = null
        runCatching { block() }
            .onSuccess {
                detail = runCatching { repo.detail(proposalId) }.getOrNull()
                successMessageRes = successRes
            }
            .onFailure { error = it.message }
        isActing = false
    }
}

@Composable
fun SwapThreadScreen(
    onOpenProfile: (String) -> Unit = {},
    onOpenChat: (String) -> Unit = {},
    vm: SwapThreadViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val d = vm.detail
    var showCounter by remember { mutableStateOf(false) }
    var showReview by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val hostFallback = stringResource(R.string.thread_host_fallback)
    val hostFallbackPossessive = stringResource(R.string.thread_host_fallback_possessive)

    // Surface ViewModel errors (M4) as a snackbar — previously swallowed.
    LaunchedEffect(vm.error) {
        vm.error?.let {
            snackbarHostState.showSnackbar(it)
            vm.clearError()
        }
    }
    // Brief success confirmation after accept/decline/withdraw/counter (M4).
    val successRes = vm.successMessageRes
    val successText = successRes?.let { stringResource(it) }
    LaunchedEffect(successRes) {
        successText?.let {
            snackbarHostState.showSnackbar(it)
            vm.consumeSuccess()
        }
    }

    androidx.compose.foundation.layout.Box(Modifier.fillMaxSize()) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
    ) {
        if (d != null) {
            StatusTagChip(d.proposal.status)
            Text("${d.proposerListing.city} ⇄ ${d.targetListing.city}", style = MaterialTheme.typography.displaySmall)
            d.other.name?.let { Text(stringResource(R.string.thread_with, it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }

            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                ListingThumb(d.proposerListing, modifier = Modifier.weight(1f))
                Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = SwaplColors.Pink, modifier = Modifier.align(Alignment.CenterVertically))
                ListingThumb(d.targetListing, modifier = Modifier.weight(1f))
            }

            ProposalBlock(d)

            // First-class chat (DOK-154): the message thread is bound to the
            // proposal and keeps flowing after it becomes an agreement.
            PrimaryPill(
                d.other.name?.let { stringResource(R.string.thread_open_chat_with, it) }
                    ?: stringResource(R.string.thread_open_chat),
                onClick = { onOpenChat(d.proposal.id) },
            )

            if (d.proposal.status == "ACCEPTED" && d.agreement != null) {
                AgreedPanel(d.agreement, d.other.name ?: hostFallbackPossessive)
            }

            // After a COMPLETED swap the server flags canReview until the
            // caller has left their (single) review — DOK-147.
            if (d.agreement?.status == "COMPLETED" && d.agreement.canReview == true) {
                LeaveReviewCard(otherName = d.other.name, onClick = { showReview = true })
            }

            TextButton(onClick = { onOpenProfile(d.other.id) }) {
                Text(stringResource(R.string.thread_view_profile, d.other.name ?: hostFallback))
            }

            ActionRow(d, vm, onCounter = { showCounter = true })
        }
    }

    SnackbarHost(
        hostState = snackbarHostState,
        modifier = Modifier.align(Alignment.BottomCenter),
    )
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

    if (showCounter && d != null) {
        // Seed the counter from the live offer (M3): an existing counter takes
        // precedence over the original proposal dates — match the propose flow,
        // which already pre-fills, instead of jumping to today+30/+37.
        CounterDialog(
            initialFrom = (d.proposal.counterDateFrom ?: d.proposal.dateFrom).take(10),
            initialTo = (d.proposal.counterDateTo ?: d.proposal.dateTo).take(10),
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
            Text(stringResource(R.string.thread_size_sleeps, l.sizeSqm, l.sleeps), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ProposalBlock(d: ProposalDetail) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel(stringResource(R.string.thread_proposal))
            Text("${d.proposal.dateFrom.take(10)} → ${d.proposal.dateTo.take(10)}", style = MaterialTheme.typography.titleLarge)
            d.proposal.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            if (d.proposal.counterDateFrom != null && d.proposal.counterDateTo != null) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                KickerLabel(stringResource(R.string.thread_counter))
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

    var showAcceptConfirm by remember { mutableStateOf(false) }
    var showDeclineConfirm by remember { mutableStateOf(false) }
    var showWithdrawConfirm by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        if (canRespond && isTarget) {
            PrimaryPill(stringResource(R.string.thread_accept), onClick = { showAcceptConfirm = true }, enabled = !vm.isActing)
            TextButton(onClick = onCounter) { Text(stringResource(R.string.thread_counter_offer)) }
            TextButton(onClick = { showDeclineConfirm = true }) { Text(stringResource(R.string.thread_decline), color = MaterialTheme.colorScheme.error) }
        }
        if (canRespond && isProposer) {
            TextButton(onClick = { showWithdrawConfirm = true }) { Text(stringResource(R.string.thread_withdraw)) }
            TextButton(onClick = onCounter) { Text(stringResource(R.string.thread_counter_offer)) }
        }
    }

    // Accept-consent (M4): state that insurance is issued on acceptance.
    if (showAcceptConfirm) {
        ConfirmDialog(
            title = stringResource(R.string.thread_accept_confirm_title),
            body = stringResource(R.string.thread_accept_confirm_body),
            confirmLabel = stringResource(R.string.thread_accept_confirm_cta),
            onConfirm = { showAcceptConfirm = false; vm.accept() },
            onDismiss = { showAcceptConfirm = false },
        )
    }
    if (showDeclineConfirm) {
        ConfirmDialog(
            title = stringResource(R.string.thread_decline_confirm_title),
            body = stringResource(R.string.thread_decline_confirm_body),
            confirmLabel = stringResource(R.string.thread_decline),
            destructive = true,
            onConfirm = { showDeclineConfirm = false; vm.decline() },
            onDismiss = { showDeclineConfirm = false },
        )
    }
    if (showWithdrawConfirm) {
        ConfirmDialog(
            title = stringResource(R.string.thread_withdraw_confirm_title),
            body = stringResource(R.string.thread_withdraw_confirm_body),
            confirmLabel = stringResource(R.string.thread_withdraw),
            destructive = true,
            onConfirm = { showWithdrawConfirm = false; vm.withdraw() },
            onDismiss = { showWithdrawConfirm = false },
        )
    }
}

@Composable
private fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    destructive: Boolean = false,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmLabel, color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}

@Composable
private fun CounterDialog(
    initialFrom: String,
    initialTo: String,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String?) -> Unit,
) {
    var from by remember { mutableStateOf(initialFrom) }
    var to by remember { mutableStateOf(initialTo) }
    var msg by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.thread_counter_offer)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                app.swapl.design.components.DateField(stringResource(R.string.filter_from), from, { from = it }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
                app.swapl.design.components.DateField(stringResource(R.string.filter_to), to, { to = it }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
                OutlinedTextField(msg, { msg = it }, label = { Text(stringResource(R.string.thread_message_optional)) }, modifier = androidx.compose.ui.Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(
                enabled = from.length == 10 && to.length == 10 && to > from,
                onClick = { onSubmit(from, to, msg.ifBlank { null }) }
            ) { Text(stringResource(R.string.propose_send)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
