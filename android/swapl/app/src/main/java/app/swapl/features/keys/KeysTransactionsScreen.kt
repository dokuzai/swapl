package app.swapl.features.keys

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.KeysTransaction
import app.swapl.core.model.KeysTransactionCategory
import app.swapl.core.repository.KeysRepository
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

// Filterable Keys ledger (DOK-157). Reached from the wallet's History section.
// A chip row partitions the transactions (All / Earned / Spent), each row shows
// its kind icon, signed delta, the running balance after, and date. "Travel
// points" copy throughout — points are never money. The list is paginated over
// the dedicated /api/keys/transactions endpoint; Earned/Spent are derived from
// the signed delta so a single fetch backs every tab.

@HiltViewModel
class KeysTransactionsViewModel @Inject constructor(private val repo: KeysRepository) : ViewModel() {
    var transactions by mutableStateOf<List<KeysTransaction>>(emptyList()); private set
    var nextCursor by mutableStateOf<String?>(null); private set
    var hasMore by mutableStateOf(false); private set
    var isLoading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        isLoading = true; error = null
        runCatching {
            val res = repo.transactions(limit = 50)
            transactions = res.transactions
            nextCursor = res.nextCursor
            hasMore = res.hasMore
        }.onFailure { if (transactions.isEmpty()) error = it.message }
        isLoading = false
    }

    fun loadMore() {
        if (isLoading || !hasMore) return
        val cursor = nextCursor ?: return
        viewModelScope.launch {
            isLoading = true
            runCatching {
                val res = repo.transactions(cursor = cursor, limit = 50)
                transactions = transactions + res.transactions
                nextCursor = res.nextCursor
                hasMore = res.hasMore
            }
            isLoading = false
        }
    }
}

@Composable
fun KeysTransactionsScreen(vm: KeysTransactionsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    var filter by androidx.compose.runtime.remember { mutableStateOf(KeysTransactionCategory.ALL) }

    val all = vm.transactions
    val filtered = all.filter { filter.matches(it) }

    when {
        all.isEmpty() && vm.error != null -> ErrorState(vm.error!!, onRetry = { vm.load() })
        all.isEmpty() && vm.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        else -> Column(Modifier.fillMaxSize().padding(SwaplSpacing.s4)) {
            Text("Points history", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(SwaplSpacing.s3))
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KeysTransactionCategory.entries.forEach { category ->
                    FilterChip(
                        selected = filter == category,
                        onClick = { filter = category },
                        label = { Text(category.label) },
                    )
                }
            }
            Spacer(Modifier.height(SwaplSpacing.s3))

            if (filtered.isEmpty()) {
                SurfaceCard {
                    Text(
                        if (filter == KeysTransactionCategory.ALL) "No points activity yet."
                        else "No ${filter.label.lowercase()} points yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                    items(filtered, key = { it.id }) { tx ->
                        TransactionRow(tx)
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                    // Only paginate when viewing All — Earned/Spent are derived
                    // client-side, so loading the next raw page still feeds them.
                    if (vm.hasMore) {
                        item {
                            TextButton(
                                onClick = { vm.loadMore() },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text(if (vm.isLoading) "Loading…" else "Load more") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TransactionRow(tx: KeysTransaction) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        Box(
            Modifier.size(40.dp).background(SwaplColors.TagBg, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(iconFor(tx.kind), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(tx.displayLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                tx.createdAt.take(10),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                if (tx.delta >= 0) "+${tx.delta}" else tx.delta.toString(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = if (tx.delta >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                "${tx.balanceAfter} bal",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// Per-kind icon, mirroring the iOS KeysTransaction.symbol mapping.
private fun iconFor(kind: String): ImageVector = when (kind) {
    "welcome", "welcome_bonus", "invite_bonus" -> Icons.Default.AutoAwesome
    "spend_stay" -> Icons.Default.Flight
    "earn_host" -> Icons.Default.Home
    "hold" -> Icons.Default.Lock
    "release" -> Icons.Default.LockOpen
    "gift_sent", "gift_received" -> Icons.Default.CardGiftcard
    "referral_bonus" -> Icons.Default.Group
    "refund" -> Icons.AutoMirrored.Filled.Undo
    // Ways-to-earn bonuses (DOK-164).
    "earn_property_verified" -> Icons.Default.Verified
    "earn_review" -> Icons.Default.Star
    "earn_share_converted" -> Icons.Default.Share
    "earn_listing_complete" -> Icons.Default.Checklist
    else -> Icons.Default.VpnKey
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Points history unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Try again") }
    }
}
