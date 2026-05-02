package app.swapl.features.swaps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalSummary
import app.swapl.core.repository.ProposalRepository
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SwapsInboxViewModel @Inject constructor(private val repo: ProposalRepository) : ViewModel() {
    var inbox by androidx.compose.runtime.mutableStateOf<InboxResponse?>(null)
        private set
    fun load() = viewModelScope.launch { runCatching { inbox = repo.inbox() } }
}

@Composable
fun SwapsInboxScreen(vm: SwapsInboxViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.fillMaxSize().padding(SwaplSpacing.s4)) {
        Text("Swap inbox", style = MaterialTheme.typography.displaySmall)
        val inbox = vm.inbox
        if (inbox != null) {
            Bucket("Waiting on you", inbox.buckets.waitingOnYou)
            Bucket("Sent — awaiting reply", inbox.buckets.sent)
            Bucket("Active swaps", inbox.buckets.active)
            if (inbox.buckets.archived.isNotEmpty()) Bucket("Archived", inbox.buckets.archived)
        }
    }
}

@Composable
private fun Bucket(title: String, items: List<ProposalSummary>) {
    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = SwaplSpacing.s4))
    if (items.isEmpty()) {
        SurfaceCard { Text("Nothing here yet.", style = MaterialTheme.typography.bodySmall) }
    } else {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            contentPadding = PaddingValues(vertical = SwaplSpacing.s2),
        ) {
            items(items, key = { it.id }) { p ->
                SurfaceCard {
                    Text("${p.myCity} ⇄ ${p.theirCity}", style = MaterialTheme.typography.titleLarge)
                    Text(p.otherName?.let { "with $it" } ?: "", style = MaterialTheme.typography.labelMedium)
                    TagChip(p.status)
                }
            }
        }
    }
}
