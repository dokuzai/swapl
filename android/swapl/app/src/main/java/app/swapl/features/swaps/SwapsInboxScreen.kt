package app.swapl.features.swaps

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
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
fun SwapsInboxScreen(
    onOpen: (String) -> Unit = {},
    vm: SwapsInboxViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.fillMaxSize().padding(SwaplSpacing.s4)) {
        Text("Swap inbox", style = MaterialTheme.typography.displaySmall)
        val inbox = vm.inbox
        if (inbox != null) {
            Bucket("Waiting on you", inbox.buckets.waitingOnYou, onOpen)
            Bucket("Sent — awaiting reply", inbox.buckets.sent, onOpen)
            Bucket("Active swaps", inbox.buckets.active, onOpen)
            if (inbox.buckets.archived.isNotEmpty()) Bucket("Archived", inbox.buckets.archived, onOpen)
        }
    }
}

@Composable
private fun Bucket(title: String, items: List<ProposalSummary>, onOpen: (String) -> Unit) {
    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = SwaplSpacing.s4))
    if (items.isEmpty()) {
        SurfaceCard { Text("Nothing here yet.", style = MaterialTheme.typography.bodySmall) }
    } else {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            contentPadding = PaddingValues(vertical = SwaplSpacing.s2),
        ) {
            items(items, key = { it.id }) { p ->
                SurfaceCard(modifier = Modifier.clickable { onOpen(p.id) }) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("${p.myCity} ⇄ ${p.theirCity}", style = MaterialTheme.typography.titleLarge)
                            Text(p.otherName?.let { "with $it" } ?: "", style = MaterialTheme.typography.labelMedium)
                        }
                        TagChip(p.status)
                    }
                }
            }
        }
    }
}
