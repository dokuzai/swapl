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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Dispute
import app.swapl.core.model.DisputeCategory
import app.swapl.core.model.MeResponse
import app.swapl.core.model.ProposalDetail
import app.swapl.core.model.TripCockpit
import app.swapl.core.network.ApiClient
import app.swapl.core.repository.DisputeRepository
import app.swapl.core.repository.ListingRepository
import app.swapl.core.repository.ProposalRepository
import app.swapl.core.repository.TripsRepository
import io.ktor.client.call.body
import io.ktor.client.request.get
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
    val repo: TripsRepository,
    private val proposals: ProposalRepository,
    val listings: ListingRepository,
    private val disputeRepo: DisputeRepository,
    val api: ApiClient,
    savedState: SavedStateHandle,
) : ViewModel(), DisputeFlowState {
    private val proposalId: String = checkNotNull(savedState["proposalId"])

    var detail by mutableStateOf<ProposalDetail?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var isSubmittingReview by mutableStateOf(false)
        private set
    var reviewError by mutableStateOf<String?>(null)
        private set

    // Trip cockpit (DOK-152): the derived phase, countdown, gated address/guide,
    // checklist and check events for the agreement attached to this proposal.
    var cockpit by mutableStateOf<TripCockpit?>(null)
        private set
    var isCheckingIn by mutableStateOf(false)
        private set

    // Dispute / resolution-center flow (DOK-153). myUserId lets the case card
    // mark which timeline messages are "You"; it's loaded best-effort from /me.
    override var disputes by mutableStateOf<List<Dispute>>(emptyList())
        private set
    override var isLoading by mutableStateOf(false)
        private set
    override var isSubmitting by mutableStateOf(false)
        private set
    override val baseUrl: String get() = api.baseUrl
    var myUserId by mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { detail = repo.detail(proposalId) }
            .onFailure { error = it.message }
        loadCockpit()
        loadDisputes()
        if (myUserId == null) {
            runCatching { api.client.get("${api.baseUrl}/api/me").body<MeResponse>().user.id }
                .onSuccess { myUserId = it }
        }
    }

    private fun loadDisputes() = viewModelScope.launch {
        val agreementId = detail?.agreement?.id ?: return@launch
        isLoading = true
        runCatching { disputes = disputeRepo.list(agreementId) }
        isLoading = false
    }

    // POST /api/agreements/{id}/dispute, then refresh so the live case card shows.
    override fun open(category: DisputeCategory, description: String, photos: List<String>, onDone: () -> Unit) {
        val agreementId = detail?.agreement?.id ?: return
        viewModelScope.launch {
            isSubmitting = true
            runCatching { disputeRepo.open(agreementId, category.raw, description, photos) }
                .onSuccess {
                    runCatching { disputes = disputeRepo.list(agreementId) }
                    onDone()
                }
            isSubmitting = false
        }
    }

    // POST /api/disputes/{id}/message, then refresh the timeline + status.
    override fun reply(disputeId: String, body: String, photos: List<String>) {
        val agreementId = detail?.agreement?.id ?: return
        viewModelScope.launch {
            isSubmitting = true
            runCatching { disputeRepo.reply(disputeId, body, photos) }
                .onSuccess { runCatching { disputes = disputeRepo.list(agreementId) } }
            isSubmitting = false
        }
    }

    private fun loadCockpit() = viewModelScope.launch {
        val agreementId = detail?.agreement?.id ?: return@launch
        runCatching { cockpit = repo.cockpit(agreementId) }
    }

    fun refreshCockpit() = viewModelScope.launch {
        val agreementId = detail?.agreement?.id ?: return@launch
        runCatching { cockpit = repo.cockpit(agreementId) }
    }

    // POST /api/agreements/{id}/check-in | check-out, then refresh the cockpit so
    // the checklist + phase + event log update. Returns true on success so the
    // caller can dismiss the sheet.
    fun submitCheckEvent(isCheckIn: Boolean, note: String, photos: List<String>, onDone: () -> Unit) =
        viewModelScope.launch {
            val agreementId = detail?.agreement?.id ?: return@launch
            isCheckingIn = true
            runCatching {
                if (isCheckIn) repo.checkIn(agreementId, note, photos)
                else repo.checkOut(agreementId, note, photos)
            }.onSuccess {
                runCatching { cockpit = repo.cockpit(agreementId) }
                onDone()
            }
            isCheckingIn = false
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

// Trip detail: the agreement view of an accepted swap. Once an agreement exists,
// the TripCockpit becomes the cockpit (phases, countdown, checklist, gated home
// guide, check-in/out). The legacy AgreedPanel still shows the keys-for-keys
// summary above it.
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
    val scope = rememberCoroutineScope()

    var showReview by remember { mutableStateOf(false) }
    var checkInSheet by remember { mutableStateOf<Boolean?>(null) } // null = closed, true = check-in
    var showGuideEditor by remember { mutableStateOf(false) }

    val guideState = remember(mine.id) { HomeGuideEditorState(mine.id, vm.repo, scope) }

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

        // The cockpit: only renders once the /trip payload has loaded.
        vm.cockpit?.let { cockpit ->
            TripCockpit(
                cockpit = cockpit,
                otherName = d.other.name,
                onFinishGuide = {
                    guideState.load()
                    showGuideEditor = true
                },
                onCheckIn = { checkInSheet = true },
                onCheckOut = { checkInSheet = false },
                reportSlot = {
                    DisputeSection(
                        state = vm,
                        otherName = d.other.name,
                        myUserId = vm.myUserId,
                        listingRepo = vm.listings,
                    )
                },
            )
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

    checkInSheet?.let { isCheckIn ->
        CheckEventSheet(
            isCheckIn = isCheckIn,
            isSubmitting = vm.isCheckingIn,
            listingRepo = vm.listings,
            onDismiss = { checkInSheet = null },
            onSubmit = { note, photos ->
                vm.submitCheckEvent(isCheckIn, note, photos) { checkInSheet = null }
            },
        )
    }

    if (showGuideEditor) {
        HomeGuideEditorScreen(
            state = guideState,
            onClose = { showGuideEditor = false },
            onSaved = {
                showGuideEditor = false
                vm.refreshCockpit()
            },
        )
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
