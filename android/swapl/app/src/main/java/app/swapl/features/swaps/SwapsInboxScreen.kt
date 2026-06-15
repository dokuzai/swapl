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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.R
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.InboxBuckets
import app.swapl.core.model.InboxResponse
import app.swapl.core.model.ProposalSummary
import app.swapl.core.repository.ProposalRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.StatusTagChip
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import androidx.compose.ui.unit.dp
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
// inbox segments, with Android FilterChip idiom. Labels/section titles resolve
// to string resources at render time via the @StringRes ids.
private enum class InboxFilter(val labelRes: Int) {
    All(R.string.inbox_filter_all),
    WaitingOnYou(R.string.inbox_filter_waiting),
    Sent(R.string.inbox_filter_sent),
    Active(R.string.inbox_filter_active),
    Archived(R.string.inbox_filter_archived),
}

private fun InboxBuckets.sections(filter: InboxFilter): List<Pair<Int, List<ProposalSummary>>> =
    when (filter) {
        InboxFilter.All -> listOf(
            R.string.inbox_section_waiting to waitingOnYou,
            R.string.inbox_section_sent to sent,
            R.string.inbox_section_active to active,
            R.string.inbox_section_archived to archived,
        ).filter { it.second.isNotEmpty() }
        InboxFilter.WaitingOnYou -> listOf(R.string.inbox_section_waiting to waitingOnYou)
        InboxFilter.Sent -> listOf(R.string.inbox_section_sent to sent)
        InboxFilter.Active -> listOf(R.string.inbox_section_active to active)
        InboxFilter.Archived -> listOf(R.string.inbox_section_archived to archived)
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
            Text(stringResource(R.string.inbox_title), style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
            IconButton(onClick = {
                searchVisible = !searchVisible
                if (!searchVisible) search = ""
            }) {
                Icon(
                    if (searchVisible) Icons.Default.Close else Icons.Default.Search,
                    contentDescription = stringResource(if (searchVisible) R.string.inbox_search_close else R.string.inbox_search_open),
                )
            }
        }
        if (searchVisible) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text(stringResource(R.string.inbox_search_placeholder)) },
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
                    label = { Text(stringResource(f.labelRes)) },
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
                            sections.forEach { (titleRes, proposals) ->
                                item(key = "header-$titleRes") {
                                    KickerLabel(stringResource(titleRes))
                                    Spacer(Modifier.height(SwaplSpacing.s1))
                                }
                                items(proposals, key = { it.id }) { p ->
                                    ProposalRow(p, onClick = { onOpen(p.id) })
                                }
                                item(key = "gap-$titleRes") { Spacer(Modifier.height(SwaplSpacing.s3)) }
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
            // Cover photo of the other home; layout unchanged without one.
            if (!p.theirCoverPhotoUrl.isNullOrBlank()) {
                ListingPhoto(
                    photoUrl = p.theirCoverPhotoUrl,
                    palette = p.theirCity,
                    height = 64.dp,
                    cornerRadius = SwaplRadius.md,
                    modifier = Modifier.width(64.dp),
                )
                Spacer(Modifier.width(SwaplSpacing.s3))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.inbox_with, p.myCity, p.theirCity),
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    stringResource(statusLineRes(p)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val from = p.dateFrom.take(10)
                val to = p.dateTo.take(10)
                Text(
                    p.otherName?.let { stringResource(R.string.inbox_dates_with, from, to, it) }
                        ?: stringResource(R.string.inbox_dates, from, to),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusTagChip(p.status)
        }
    }
}

private fun statusLineRes(p: ProposalSummary): Int = when (p.status) {
    "ACCEPTED" -> R.string.inbox_status_confirmed
    "COUNTERED" -> R.string.inbox_status_countered
    "DECLINED" -> R.string.inbox_status_declined
    else -> if (p.meSide == "target") R.string.inbox_status_waiting_reply else R.string.inbox_status_sent
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.inbox_error_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.inbox_error_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.common_retry)) }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.inbox_empty_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.inbox_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
