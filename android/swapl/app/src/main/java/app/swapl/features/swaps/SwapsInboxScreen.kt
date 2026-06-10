package app.swapl.features.swaps

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.InboxBuckets
import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalSummary
import app.swapl.core.repository.ProposalRepository
import app.swapl.design.components.KickerLabel
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
    var isRefreshing by androidx.compose.runtime.mutableStateOf(false)
        private set
    var error by androidx.compose.runtime.mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { inbox = repo.inbox() }.onFailure { if (inbox == null) error = it.message }
    }

    fun refresh() = viewModelScope.launch {
        isRefreshing = true
        runCatching { inbox = repo.inbox() }.onFailure { if (inbox == null) error = it.message }
        isRefreshing = false
    }
}

// Filter chips over the server-side buckets — same mental model as the iOS
// inbox segments, with Android FilterChip idiom.
private enum class InboxFilter(val label: String) {
    All("All"),
    WaitingOnYou("Waiting on you"),
    Sent("Sent"),
    Active("Active"),
    Archived("Archived"),
}

private fun InboxBuckets.sections(filter: InboxFilter): List<Pair<String, List<ProposalSummary>>> =
    when (filter) {
        InboxFilter.All -> listOf(
            "Waiting on you" to waitingOnYou,
            "Sent — awaiting reply" to sent,
            "Active swaps" to active,
            "Archived" to archived,
        ).filter { it.second.isNotEmpty() }
        InboxFilter.WaitingOnYou -> listOf("Waiting on you" to waitingOnYou)
        InboxFilter.Sent -> listOf("Sent — awaiting reply" to sent)
        InboxFilter.Active -> listOf("Active swaps" to active)
        InboxFilter.Archived -> listOf("Archived" to archived)
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwapsInboxScreen(
    onOpen: (String) -> Unit = {},
    vm: SwapsInboxViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    var filter by rememberSaveable { mutableStateOf(InboxFilter.All) }

    var searchVisible by rememberSaveable { mutableStateOf(false) }
    var search by rememberSaveable { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
        ) {
            Text("Swap inbox", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
            IconButton(onClick = {
                searchVisible = !searchVisible
                if (!searchVisible) search = ""
            }) {
                Icon(
                    if (searchVisible) Icons.Default.Close else Icons.Default.Search,
                    contentDescription = if (searchVisible) "Close search" else "Search",
                )
            }
        }
        if (searchVisible) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search by host or city") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SwaplSpacing.s4)
                    .padding(bottom = SwaplSpacing.s2),
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4)
                .horizontalScroll(rememberScrollState()),
        ) {
            InboxFilter.values().forEach { f ->
                FilterChip(
                    selected = filter == f,
                    onClick = { filter = f },
                    label = { Text(f.label) },
                )
            }
        }

        PullToRefreshBox(
            isRefreshing = vm.isRefreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            val inbox = vm.inbox
            when {
                vm.error != null -> ErrorState(onRetry = { vm.load() })
                inbox == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                else -> {
                    val q = search.trim()
                    val sections = inbox.buckets.sections(filter).map { (title, list) ->
                        title to if (q.isEmpty()) list else list.filter { p ->
                            (p.otherName ?: "").contains(q, ignoreCase = true) ||
                                p.theirCity.contains(q, ignoreCase = true) ||
                                p.myCity.contains(q, ignoreCase = true)
                        }
                    }.filter { it.second.isNotEmpty() }
                    if (sections.all { it.second.isEmpty() }) {
                        EmptyState()
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
                            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            sections.forEach { (title, proposals) ->
                                item(key = "header-$title") {
                                    KickerLabel(title)
                                    Spacer(Modifier.height(SwaplSpacing.s1))
                                }
                                items(proposals, key = { it.id }) { p ->
                                    ProposalRow(p, onClick = { onOpen(p.id) })
                                }
                                item(key = "gap-$title") { Spacer(Modifier.height(SwaplSpacing.s3)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProposalRow(p: ProposalSummary, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("${p.myCity} ⇄ ${p.theirCity}", style = MaterialTheme.typography.titleLarge)
                Text(
                    statusLine(p),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "${p.dateFrom.take(10)} → ${p.dateTo.take(10)}" +
                        (p.otherName?.let { " · with $it" } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TagChip(p.status)
        }
    }
}

private fun statusLine(p: ProposalSummary): String = when (p.status) {
    "ACCEPTED" -> "Confirmed swap"
    "COUNTERED" -> "Counter offer received"
    "DECLINED" -> "Proposal declined"
    else -> if (p.meSide == "target") "Waiting for your reply" else "Proposal sent"
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Messages unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "We couldn't load your swaps. Pull to refresh or retry.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("No messages yet", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "Propose a swap from any listing and it will show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
