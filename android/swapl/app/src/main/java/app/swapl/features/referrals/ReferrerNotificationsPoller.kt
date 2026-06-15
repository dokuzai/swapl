package app.swapl.features.referrals

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.ReferrerNotification
import app.swapl.core.repository.ReferralRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// Real-time referrer notifications (DOK-157). Closes the dopamine loop: while
// the account screen is open, poll GET /api/referrals/notifications for
// rewarded-but-unseen referral credits and emit each as a one-time snackbar
// ("NAME just verified — you earned 20 Keys!"), acking them so they show
// exactly once. Mirrors the web ReferrerNotifications component. Strictly
// best-effort; the persisted unseen-credit is the source of truth, so nothing
// is lost if the app was closed.

@HiltViewModel
class ReferrerNotificationsViewModel @Inject constructor(
    private val repo: ReferralRepository,
) : ViewModel() {
    // Credits to surface, delivered to the UI one at a time. A Channel (vs.
    // state) gives natural FIFO + back-pressure so each toast plays in turn.
    private val _credits = Channel<ReferrerNotification>(Channel.BUFFERED)
    val credits = _credits.receiveAsFlow()

    // Ids already enqueued this session — dedupe across polls before the
    // server ack lands.
    private val seen = mutableSetOf<String>()
    private var started = false

    fun start() {
        if (started) return
        started = true
        viewModelScope.launch {
            while (true) {
                poll()
                kotlinx.coroutines.delay(POLL_INTERVAL_MS)
            }
        }
    }

    private suspend fun poll() {
        val fresh = runCatching { repo.notifications() }.getOrNull() ?: return
        // Oldest first so credits toast in the order they happened.
        val unseen = fresh.filterNot { seen.contains(it.id) }.asReversed()
        if (unseen.isEmpty()) return
        unseen.forEach {
            seen.add(it.id)
            _credits.send(it)
        }
        // Ack immediately — the snackbar is driven from the channel now.
        val ids = unseen.map { it.id }
        runCatching { repo.ackNotifications(ids) }
    }

    private companion object {
        const val POLL_INTERVAL_MS = 20_000L
    }
}

@Composable
fun ReferrerNotificationsPoller(
    showMessage: (String) -> Unit,
    vm: ReferrerNotificationsViewModel = hiltViewModel(),
) {
    val named = stringResource(R.string.referral_referrer_toast_named)
    val plain = stringResource(R.string.referral_referrer_toast)
    LaunchedEffect(Unit) {
        vm.start()
        vm.credits.collect { credit ->
            val msg = credit.refereeName?.let { name -> named.format(name, credit.keys) }
                ?: plain.format(credit.keys)
            showMessage(msg)
        }
    }
}
