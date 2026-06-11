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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
            "Metrics",
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
            Section("Now") {
                Row(Modifier.fillMaxWidth()) {
                    BigStat("Online now", m.now.online, Modifier.weight(1f), accent = true)
                    BigStat("Today", m.now.dau, Modifier.weight(1f))
                    BigStat("7 days", m.now.wau, Modifier.weight(1f))
                    BigStat("30 days", m.now.mau, Modifier.weight(1f))
                }
            }
        }

        // Users
        item(key = "users") {
            Section("Users") {
                MetricRow("Total", m.users.total.toString())
                MetricRow("Email verified", m.users.emailVerified.toString())
                MetricRow("With active listing", m.users.withActiveListing.toString())
                MetricRow("New (7 days)", m.users.new7d.toString())
                MetricRow("New (30 days)", m.users.new30d.toString())
            }
        }

        // Listings per user
        item(key = "listingsPerUser") {
            Section("Listings per user") {
                val d = m.listingsPerUser.distribution
                Row(Modifier.fillMaxWidth()) {
                    BigStat("0", d.zero, Modifier.weight(1f))
                    BigStat("1", d.one, Modifier.weight(1f))
                    BigStat("2", d.two, Modifier.weight(1f))
                    BigStat("3+", d.threePlus, Modifier.weight(1f))
                }
                Spacer(Modifier.height(SwaplSpacing.s2))
                MetricRow(
                    "Avg per user with listing",
                    String.format(Locale.US, "%.2f", m.listingsPerUser.avgPerUserWithListing),
                )
                if (m.listingsPerUser.topUsers.isNotEmpty()) {
                    var onlineOnly by remember { mutableStateOf(false) }
                    Spacer(Modifier.height(SwaplSpacing.s2))
                    KickerLabel("Top hosts")
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    FilterChip(
                        selected = onlineOnly,
                        onClick = { onlineOnly = !onlineOnly },
                        label = { Text("Online only") },
                    )
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    val shownUsers = if (onlineOnly) {
                        m.listingsPerUser.topUsers.filter { it.online }
                    } else {
                        m.listingsPerUser.topUsers
                    }
                    if (shownUsers.isEmpty()) {
                        Text(
                            "No hosts online right now.",
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
                            val statusLabel = if (u.online) "Online" else "Offline"
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
            Section("Top cities") {
                MetricRow("Active listings", m.cities.totalActiveListings.toString())
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
            Section("Proposals") {
                MetricRow("Total", m.engagement.proposalsTotal.toString())
                MetricRow("Accept rate", formatPercent(m.engagement.proposalAcceptRate))
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
            Section("Engagement") {
                MetricRow("Active agreements", m.engagement.agreementsActive.toString())
                MetricRow("Completed agreements", m.engagement.agreementsCompleted.toString())
                MetricRow("Messages (total)", m.engagement.messagesTotal.toString())
                MetricRow("Messages (7 days)", m.engagement.messages7d.toString())
                MetricRow("Favorites (total)", m.engagement.favoritesTotal.toString())
                MetricRow("Favorites (7 days)", m.engagement.favorites7d.toString())
                MetricRow("Saved searches", m.engagement.savedSearches.toString())
            }
        }

        item(key = "generatedAt") {
            Text(
                "Generated ${m.generatedAt.take(19).replace('T', ' ')} UTC",
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
        Text("Metrics unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            "We couldn't load the metrics. Pull to refresh or retry.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Retry") }
    }
}
