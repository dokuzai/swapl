package app.swapl.features.swaps

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.repository.ChatRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

// Drives the unread badge on the Messages tab (DOK-154). Polls GET
// /api/conversations lightly while the app is in the foreground; the total is
// the sum of inbound unread across the viewer's swap threads. Speculare with
// iOS's UnreadStore.
@HiltViewModel
class UnreadViewModel @Inject constructor(private val repo: ChatRepository) : ViewModel() {
    var totalUnread by mutableStateOf(0); private set

    private var pollJob: Job? = null

    fun refresh() = viewModelScope.launch {
        // Best-effort: leave the last known count on a transient failure.
        runCatching { repo.conversations() }.onSuccess { totalUnread = it.totalUnread }
    }

    fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = viewModelScope.launch {
            while (true) {
                runCatching { repo.conversations() }.onSuccess { totalUnread = it.totalUnread }
                delay(20_000)
            }
        }
    }

    fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    override fun onCleared() { stopPolling() }
}
