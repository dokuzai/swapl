package app.swapl.features.trips

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.remember
import app.swapl.core.model.ProposalDetail
import app.swapl.core.repository.ProposalRepository
import app.swapl.core.repository.TripsRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import app.swapl.features.swaps.AgreedPanel
import app.swapl.features.swaps.LeaveReviewCard
import app.swapl.features.swaps.LeaveReviewDialog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TripDetailViewModel @Inject constructor(
    private val repo: TripsRepository,
    private val proposals: ProposalRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val proposalId: String = checkNotNull(savedState["proposalId"])

    var detail by mutableStateOf<ProposalDetail?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var isSubmittingReview by mutableStateOf(false)
        private set
    var reviewError by mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { detail = repo.detail(proposalId) }
            .onFailure { error = it.message }
    }

    // POST /api/agreements/{id}/review, then refresh so canReview clears.
    fun submitReview(rating: Int, text: String, onDone: () -> Unit) = viewModelScope.launch {
        val agreementId = detail?.agreement?.id ?: return@launch
        isSubmittingReview = true
        reviewError = null
        runCatching { proposals.submitReview(agreementId, rating, text) }
            .onSuccess {
                detail = runCatching { repo.detail(proposalId) }.getOrNull() ?: detail
                onDone()
            }
            .onFailure { reviewError = it.message }
        isSubmittingReview = false
    }
}

// Trip detail: the agreement view of an accepted swap. Key codes and the
// insurance panel come from the shared AgreedPanel used by the swap thread.
@Composable
fun TripDetailScreen(
    onOpenProfile: (String) -> Unit = {},
    vm: TripDetailViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val d = vm.detail

    when {
        vm.error != null -> Column(
            Modifier.fillMaxSize().padding(SwaplSpacing.s8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Trip unavailable", style = MaterialTheme.typography.titleLarge)
            Text(
                "We couldn't load this trip.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = { vm.load() }) { Text("Retry") }
        }
        d == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        else -> TripDetailBody(d, vm, onOpenProfile)
    }
}

@Composable
private fun TripDetailBody(d: ProposalDetail, vm: TripDetailViewModel, onOpenProfile: (String) -> Unit) {
    val meIsProposer = d.proposal.meSide == "proposer"
    val mine = if (meIsProposer) d.proposerListing else d.targetListing
    val theirs = if (meIsProposer) d.targetListing else d.proposerListing
    val a = d.agreement
    val hostName = d.other.name ?: "your host"
    var showReview by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
    ) {
        TagChip(a?.status ?: d.proposal.status)
        Text("Trip to ${theirs.city}", style = MaterialTheme.typography.displaySmall)
        d.other.name?.let {
            Text(
                "Hosted by $it",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        SurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("Your stay")
                Text(
                    "${(a?.dateFrom ?: d.proposal.dateFrom).take(10)} → ${(a?.dateTo ?: d.proposal.dateTo).take(10)}",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    "Guest at $hostName's place — ${theirs.neighbourhood} · ${theirs.city}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "In return you host in ${mine.neighbourhood} · ${mine.city} for the same dates.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (a != null) {
            AgreedPanel(a, hostName)
        }

        // After a COMPLETED swap the server flags canReview until the caller
        // has left their (single) review — DOK-147.
        if (a?.status == "COMPLETED" && a.canReview == true) {
            LeaveReviewCard(otherName = d.other.name, onClick = { showReview = true })
        }

        TextButton(onClick = { onOpenProfile(d.other.id) }) {
            Text("View ${d.other.name ?: "host"}'s profile")
        }
    }

    if (showReview) {
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
}
