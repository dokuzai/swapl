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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.KeysTransaction
import app.swapl.core.model.KeysWallet
import app.swapl.core.repository.KeysRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.plugins.ClientRequestException
import kotlinx.coroutines.launch
import javax.inject.Inject

// Keys wallet (DOK-155). Reached from Account → "Travel points". Shows the
// balance, the nightly-Keys value of the member's own homes, the ledger
// history, and a "Gift points" entry. Copy stays in "travel points" language —
// Keys are never money, never bought, never cashed out.

@HiltViewModel
class KeysWalletViewModel @Inject constructor(private val repo: KeysRepository) : ViewModel() {
    var wallet by mutableStateOf<KeysWallet?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { wallet = repo.wallet() }
            .onFailure { if (wallet == null) error = it.message }
    }
}

@Composable
fun KeysWalletScreen(vm: KeysWalletViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    var gifting by remember { mutableStateOf(false) }

    val wallet = vm.wallet
    when {
        wallet == null && vm.error != null -> ErrorState(vm.error!!, onRetry = { vm.load() })
        wallet == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        else -> Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(SwaplSpacing.s4),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
        ) {
            Text("Travel points", style = MaterialTheme.typography.displaySmall)

            BalanceCard(wallet.balance)
            GiftEntry(onClick = { gifting = true })

            if (wallet.nightlyKeysForMyListings.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    KickerLabel("Your homes earn")
                    wallet.nightlyKeysForMyListings.forEach { NightlyRow(it) }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                KickerLabel("History")
                if (wallet.recentTransactions.isEmpty()) {
                    SurfaceCard {
                        Text(
                            "No points activity yet. Earn points by hosting, or gift some to a friend.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    SurfaceCard {
                        Column {
                            wallet.recentTransactions.forEachIndexed { index, tx ->
                                TransactionRow(tx)
                                if (index < wallet.recentTransactions.lastIndex) {
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(SwaplSpacing.s4))
        }
    }

    if (gifting) {
        GiftKeysDialog(
            onDismiss = { gifting = false },
            onSent = {
                gifting = false
                vm.load()
            },
        )
    }
}

@Composable
private fun BalanceCard(balance: Int) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.Navy, RoundedCornerShape(SwaplRadius.xl))
            .padding(SwaplSpacing.s5),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(Icons.Default.VpnKey, contentDescription = null, tint = SwaplColors.Cream)
                Text(
                    "Your travel points",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SwaplColors.Cream,
                )
            }
            Text(
                balance.toString(),
                style = MaterialTheme.typography.displayLarge,
                color = SwaplColors.Cream,
            )
            Text(
                "Spend them on a stay without a simultaneous swap. Points are not money — you can't buy or cash them out.",
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Cream.copy(alpha = 0.85f),
            )
        }
    }
}

@Composable
private fun GiftEntry(onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Icon(Icons.Default.CardGiftcard, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f)) {
                Text("Gift points", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Send points to a verified friend",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NightlyRow(home: KeysWallet.NightlyKeysListing) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Icon(Icons.Default.Home, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Text(home.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(
                "${home.nightlyKeys} / night",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun TransactionRow(tx: KeysTransaction) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = SwaplSpacing.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(tx.displayLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                tx.createdAt.take(10),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            if (tx.delta >= 0) "+${tx.delta}" else tx.delta.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = if (tx.delta >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Points unavailable", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text("Try again") }
    }
}

// Gift dialog — caps mirror GIFT_MAX_PER_TRANSFER / GIFT_DAILY_CAP in
// lib/keys/config.ts. Points are a gift: never bought, never cashed out.
@HiltViewModel
class GiftKeysViewModel @Inject constructor(private val repo: KeysRepository) : ViewModel() {
    var isSending by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var success by mutableStateOf<String?>(null); private set

    fun send(recipientId: String, amount: Int, onSent: () -> Unit) {
        if (isSending) return
        viewModelScope.launch {
            isSending = true; error = null; success = null
            try {
                val res = repo.gift(recipientId.trim(), amount)
                success = "Sent ${res.amount} point${if (res.amount == 1) "" else "s"}. You now have ${res.balanceAfter}."
                onSent()
            } catch (t: ClientRequestException) {
                error = when (t.response.status.value) {
                    403 -> "Both you and your friend need to be verified members to gift points."
                    404 -> "We couldn't find that member. Double-check the ID."
                    422 -> "You don't have enough points for this gift."
                    else -> "Couldn't send points right now."
                }
            } catch (t: Throwable) {
                error = t.message ?: "Couldn't send points right now."
            } finally {
                isSending = false
            }
        }
    }
}

private const val GIFT_MAX_PER_TRANSFER = 50
private const val GIFT_DAILY_CAP = 100

@Composable
fun GiftKeysDialog(
    onDismiss: () -> Unit,
    onSent: () -> Unit,
    vm: GiftKeysViewModel = hiltViewModel(),
) {
    var recipientId by remember { mutableStateOf("") }
    var amount by remember { mutableIntStateOf(5) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Gift points") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                OutlinedTextField(
                    value = recipientId,
                    onValueChange = { recipientId = it },
                    label = { Text("Member ID") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Ask your friend for their Swapl member ID. They must be a verified member.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "$amount point${if (amount == 1) "" else "s"}",
                    style = MaterialTheme.typography.titleLarge,
                )
                Slider(
                    value = amount.toFloat(),
                    onValueChange = { amount = it.toInt().coerceIn(1, GIFT_MAX_PER_TRANSFER) },
                    valueRange = 1f..GIFT_MAX_PER_TRANSFER.toFloat(),
                )
                Text(
                    "Up to $GIFT_MAX_PER_TRANSFER per gift, $GIFT_DAILY_CAP per day. Points are a gift — they can't be bought or cashed out.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                vm.success?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !vm.isSending && recipientId.isNotBlank(),
                onClick = { vm.send(recipientId, amount, onSent) },
            ) { Text(if (vm.isSending) "Sending…" else "Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
