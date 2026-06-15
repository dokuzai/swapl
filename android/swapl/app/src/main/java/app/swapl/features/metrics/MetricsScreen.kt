package app.swapl.features.metrics

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.AdminMetrics
import app.swapl.core.repository.MetricsRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class MetricsViewModel @Inject constructor(private val repo: MetricsRepository) : ViewModel() {
    var metrics by mutableStateOf<AdminMetrics?>(null)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { metrics = repo.adminMetrics() }
            .onFailure { if (metrics == null) error = it.message ?: "Unknown error" }
    }

    fun refresh() = viewModelScope.launch {
        isRefreshing = true
        runCatching { metrics = repo.adminMetrics() }
            .onFailure { if (metrics == null) error = it.message ?: "Unknown error" }
        isRefreshing = false
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MetricsScreen(vm: MetricsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }

    Column(Modifier.fillMaxSize()) {
        Text(
            stringResource(R.string.metrics_title),
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
        )

        PullToRefreshBox(
            isRefreshing = vm.isRefreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            val m = vm.metrics
            when {
                vm.error != null && m == null -> ErrorState(onRetry = { vm.load() })
                m == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                else -> MetricsContent(m)
            }
        }
    }
}

@Composable
private fun MetricsContent(m: AdminMetrics) {
    LazyColumn(
        contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        modifier = Modifier.fillMaxSize(),
    ) {
        // Now
        item(key = "now") {
            Section(stringResource(R.string.metrics_section_now)) {
                Row(Modifier.fillMaxWidth()) {
                    BigStat(stringResource(R.string.metrics_online_now), m.now.online, Modifier.weight(1f), accent = true)
                    BigStat(stringResource(R.string.metrics_today), m.now.dau, Modifier.weight(1f))
                    BigStat(stringResource(R.string.metrics_7_days), m.now.wau, Modifier.weight(1f))
                    BigStat(stringResource(R.string.metrics_30_days), m.now.mau, Modifier.weight(1f))
                }
            }
        }

        // Users
        item(key = "users") {
            Section(stringResource(R.string.metrics_section_users)) {
                MetricRow(stringResource(R.string.metrics_total), m.users.total.toString())
                MetricRow(stringResource(R.string.metrics_email_verified), m.users.emailVerified.toString())
                MetricRow(stringResource(R.string.metrics_with_active_listing), m.users.withActiveListing.toString())
                MetricRow(stringResource(R.string.metrics_new_7d), m.users.new7d.toString())
                MetricRow(stringResource(R.string.metrics_new_30d), m.users.new30d.toString())
            }
        }

        // Listings per user
        item(key = "listingsPerUser") {
            Section(stringResource(R.string.metrics_section_listings_per_user)) {
                val d = m.listingsPerUser.distribution
                Row(Modifier.fillMaxWidth()) {
                    BigStat("0", d.zero, Modifier.weight(1f))
                    BigStat("1", d.one, Modifier.weight(1f))
                    BigStat("2", d.two, Modifier.weight(1f))
                    BigStat("3+", d.threePlus, Modifier.weight(1f))
                }
                Spacer(Modifier.height(SwaplSpacing.s2))
                MetricRow(
                    stringResource(R.string.metrics_avg_per_user),
                    String.format(Locale.US, "%.2f", m.listingsPerUser.avgPerUserWithListing),
                )
                if (m.listingsPerUser.topUsers.isNotEmpty()) {
                    var onlineOnly by remember { mutableStateOf(false) }
                    Spacer(Modifier.height(SwaplSpacing.s2))
                    KickerLabel(stringResource(R.string.metrics_top_hosts))
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    FilterChip(
                        selected = onlineOnly,
                        onClick = { onlineOnly = !onlineOnly },
                        label = { Text(stringResource(R.string.metrics_online_only)) },
                    )
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    val shownUsers = if (onlineOnly) {
                        m.listingsPerUser.topUsers.filter { it.online }
                    } else {
                        m.listingsPerUser.topUsers
                    }
                    if (shownUsers.isEmpty()) {
                        Text(
                            stringResource(R.string.metrics_no_hosts_online),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s1),
                        )
                    }
                    shownUsers.forEach { u ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s1),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val statusLabel = if (u.online) stringResource(R.string.metrics_online) else stringResource(R.string.metrics_offline)
                            Box(
                                Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (u.online) Color(0xFF2E7D32) else Color(0xFFC62828))
                                    .semantics { contentDescription = statusLabel },
                            )
                            Spacer(Modifier.width(SwaplSpacing.s2))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    u.name ?: u.email.substringBefore("@"),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    u.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                "${u.listings}",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        }

        // Top cities
        item(key = "cities") {
            Section(stringResource(R.string.metrics_section_top_cities)) {
                MetricRow(stringResource(R.string.metrics_active_listings), m.cities.totalActiveListings.toString())
                if (m.cities.top.isNotEmpty()) {
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    m.cities.top.forEach { c ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s1),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                c.city,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                "${c.listings} · ${formatPercent(c.share)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        // Proposals
        item(key = "proposals") {
            Section(stringResource(R.string.metrics_section_proposals)) {
                MetricRow(stringResource(R.string.metrics_total), m.engagement.proposalsTotal.toString())
                MetricRow(stringResource(R.string.metrics_accept_rate), formatPercent(m.engagement.proposalAcceptRate))
                if (m.engagement.proposalsByStatus.isNotEmpty()) {
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    m.engagement.proposalsByStatus.entries
                        .sortedByDescending { it.value }
                        .forEach { (status, n) ->
                            MetricRow(status.lowercase().replaceFirstChar { it.uppercase() }, n.toString())
                        }
                }
            }
        }

        // Engagement
        item(key = "engagement") {
            Section(stringResource(R.string.metrics_section_engagement)) {
                MetricRow(stringResource(R.string.metrics_active_agreements), m.engagement.agreementsActive.toString())
                MetricRow(stringResource(R.string.metrics_completed_agreements), m.engagement.agreementsCompleted.toString())
                MetricRow(stringResource(R.string.metrics_messages_total), m.engagement.messagesTotal.toString())
                MetricRow(stringResource(R.string.metrics_messages_7d), m.engagement.messages7d.toString())
                MetricRow(stringResource(R.string.metrics_favorites_total), m.engagement.favoritesTotal.toString())
                MetricRow(stringResource(R.string.metrics_favorites_7d), m.engagement.favorites7d.toString())
                MetricRow(stringResource(R.string.metrics_saved_searches), m.engagement.savedSearches.toString())
            }
        }

        item(key = "generatedAt") {
            Text(
                stringResource(R.string.metrics_generated_at, m.generatedAt.take(19).replace('T', ' ')),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun formatPercent(share: Double): String =
    String.format(Locale.US, "%.1f%%", share * 100)

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    SurfaceCard {
        Column(Modifier.fillMaxWidth()) {
            KickerLabel(title)
            Spacer(Modifier.height(SwaplSpacing.s2))
            content()
        }
    }
}

@Composable
private fun BigStat(label: String, value: Int, modifier: Modifier = Modifier, accent: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value.toString(),
            style = MaterialTheme.typography.headlineMedium,
            color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(value, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.metrics_error_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.metrics_error_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.common_retry)) }
    }
}
