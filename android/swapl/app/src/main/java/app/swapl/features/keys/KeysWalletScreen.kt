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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.EarnWay
import app.swapl.core.model.EarnWaysPayload
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
    var earnWays by mutableStateOf<EarnWaysPayload?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { wallet = repo.wallet() }
            .onFailure { if (wallet == null) error = it.message }
        // Prefer the payload the wallet already embeds (one round trip). Only
        // fall back to the standalone endpoint when an older server omits it.
        wallet?.earnWays?.let { earnWays = it }
        if (earnWays == null) {
            runCatching { earnWays = repo.earnWays() }
        }
    }
}

@Composable
fun KeysWalletScreen(
    onSeeAllTransactions: () -> Unit = {},
    vm: KeysWalletViewModel = hiltViewModel(),
) {
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
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                Text("Travel points", style = MaterialTheme.typography.displaySmall)
                // First-touch one-liner: earn → spend, never money. This is the
                // single sentence that has to land in 5 seconds.
                Text(
                    "Points you earn by hosting. Spend them on a stay — never money, never bought or cashed out.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            BalanceCard(wallet.balance)

            // Concrete example that closes the earn→spend loop ("flywheel").
            // Uses one of the member's own homes as the rate when available so
            // the numbers feel real; otherwise a representative rate.
            InActionCard(wallet.nightlyKeysForMyListings.firstOrNull()?.nightlyKeys)

            // When the wallet is empty, lead with how to fill it — never a dead
            // end. The verification path shows its instant +30 reward up front.
            if (wallet.balance == 0) {
                EarnPathsCard(welcomeBonus = WELCOME_BONUS_KEYS)
            }

            // Ways to earn Keys (DOK-164) — a server-owned catalogue of the
            // actions that mint points, with amounts and a done/to-do state.
            // Encouraging, not spammy: shown only when the backend exposes it.
            vm.earnWays?.takeIf { it.ways.isNotEmpty() }?.let { WaysToEarnSection(it) }

            GiftEntry(onClick = { gifting = true })

            if (wallet.nightlyKeysForMyListings.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    KickerLabel("Your homes earn")
                    Text(
                        "This is what you earn each night a guest stays — points you can then spend on a stay elsewhere.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    wallet.nightlyKeysForMyListings.forEach { NightlyRow(it, wallet.balance) }
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
                    // Filterable, paginated ledger (DOK-157).
                    TextButton(onClick = onSeeAllTransactions, modifier = Modifier.fillMaxWidth()) {
                        Text("See all points history")
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
private fun NightlyRow(home: KeysWallet.NightlyKeysListing, balance: Int) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(Icons.Default.Home, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(home.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(
                    "${home.nightlyKeys} / night",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            // Give the rate a scale: how many nights the member could already
            // book at this home's rate with their current balance.
            if (home.nightlyKeys > 0) {
                val nights = balance / home.nightlyKeys
                Text(
                    "Your balance covers about $nights night${if (nights == 1) "" else "s"} at this rate.",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// The "earning & spending in action" card — one concrete round trip that turns
// the abstract "travel points" into something you can picture. Mirrors the web
// example card on /account/keys. Rate defaults to a representative value when
// the member has no home listed yet.
@Composable
private fun InActionCard(nightlyRate: Int?) {
    val rate = (nightlyRate ?: 8).coerceAtLeast(1)
    val earned = rate * 2
    Box(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.lg))
            .padding(SwaplSpacing.s5),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            KickerLabel("How points work")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(Icons.Default.Home, contentDescription = null, tint = SwaplColors.Navy, modifier = Modifier.size(20.dp))
                Text(
                    "Host 2 nights at $rate points/night",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = SwaplColors.Navy,
                    modifier = Modifier.weight(1f),
                )
                Text("+$earned", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Navy, fontWeight = FontWeight.Bold)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(Icons.Default.VpnKey, contentDescription = null, tint = SwaplColors.Navy, modifier = Modifier.size(20.dp))
                Text(
                    "Spend those $earned points on 2 nights somewhere else",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = SwaplColors.Navy,
                    modifier = Modifier.weight(1f),
                )
                Text("-$earned", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Navy, fontWeight = FontWeight.Bold)
            }
            Text(
                "That's the whole loop: host → earn points → travel → repeat. No money changes hands.",
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy2,
            )
        }
    }
}

// Shown when the balance is 0: the fastest paths to a first balance, with the
// instant verification reward (+30) called out as the hero. No new endpoints —
// pure onboarding copy.
@Composable
private fun EarnPathsCard(welcomeBonus: Int) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.lg))
            .padding(SwaplSpacing.s5),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Text("Get your first points", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Navy)
            EarnRow(
                title = "Verify your identity",
                body = "Get $welcomeBonus points the moment you're verified — instantly.",
                badge = "+$welcomeBonus",
            )
            EarnRow(
                title = "Host a stay",
                body = "Earn points every night a guest stays with you.",
                badge = null,
            )
            EarnRow(
                title = "Receive a gift",
                body = "A verified friend can send you points — share your member ID.",
                badge = null,
            )
        }
    }
}

@Composable
private fun EarnRow(title: String, body: String, badge: String?) {
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = SwaplColors.Navy)
            Text(body, style = MaterialTheme.typography.bodySmall, color = SwaplColors.Navy2)
        }
        if (badge != null) {
            Text(
                badge,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(SwaplRadius.sm))
                    .padding(horizontal = SwaplSpacing.s2, vertical = SwaplSpacing.s1),
            )
        }
    }
}

// "Ways to earn Keys" (DOK-164). Lists the server-owned earn catalogue with each
// action's amount and a done/to-do state. Gated rows show as locked until the
// member verifies their identity. Reads entirely from the EarnWaysPayload — copy
// & icon are mapped per stable `key`, never invented client-side.
@Composable
private fun WaysToEarnSection(payload: EarnWaysPayload) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel(stringResource(R.string.keys_earn_ways_title))
        Text(
            stringResource(R.string.keys_earn_ways_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SurfaceCard {
            Column {
                payload.ways.forEachIndexed { index, way ->
                    WayToEarnRow(way, identityVerified = payload.identityVerified)
                    if (index < payload.ways.lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
}

@Composable
private fun WayToEarnRow(way: EarnWay, identityVerified: Boolean) {
    // A gated action is "locked" until the member is verified. The identity
    // action itself is never gated, so it's the one that unlocks the rest.
    val locked = way.gatedOnIdentity && !identityVerified
    // Non-repeatable + already earned = done. Repeatable actions never show as
    // done; they keep encouraging the member to do it again.
    val done = way.done && !way.repeatable

    Row(
        Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        Icon(
            earnWayIcon(way.key),
            contentDescription = null,
            tint = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                stringResource(earnWayTitle(way.key)),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                when {
                    locked -> stringResource(R.string.keys_earn_way_locked)
                    done -> stringResource(R.string.keys_earn_way_done)
                    else -> stringResource(earnWayBody(way.key))
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (done) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = stringResource(R.string.keys_earn_way_done),
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
        } else {
            Text(
                "+${way.amount}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier
                    .background(
                        if (locked) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary,
                        RoundedCornerShape(SwaplRadius.sm),
                    )
                    .padding(horizontal = SwaplSpacing.s2, vertical = SwaplSpacing.s1),
            )
        }
    }
}

// Per-action icon, keyed off the stable EarnWay.key.
private fun earnWayIcon(key: String) = when (key) {
    "verify_identity" -> Icons.Default.Verified
    "verify_property" -> Icons.Default.Home
    "complete_listing" -> Icons.Default.Checklist
    "leave_review" -> Icons.Default.Star
    "share_converted" -> Icons.Default.Share
    "refer_friend" -> Icons.Default.Group
    else -> Icons.Default.VpnKey
}

private fun earnWayTitle(key: String): Int = when (key) {
    "verify_identity" -> R.string.keys_earn_verify_identity_title
    "verify_property" -> R.string.keys_earn_verify_property_title
    "complete_listing" -> R.string.keys_earn_complete_listing_title
    "leave_review" -> R.string.keys_earn_leave_review_title
    "share_converted" -> R.string.keys_earn_share_converted_title
    "refer_friend" -> R.string.keys_earn_refer_friend_title
    else -> R.string.keys_earn_generic_title
}

private fun earnWayBody(key: String): Int = when (key) {
    "verify_identity" -> R.string.keys_earn_verify_identity_body
    "verify_property" -> R.string.keys_earn_verify_property_body
    "complete_listing" -> R.string.keys_earn_complete_listing_body
    "leave_review" -> R.string.keys_earn_leave_review_body
    "share_converted" -> R.string.keys_earn_share_converted_body
    "refer_friend" -> R.string.keys_earn_refer_friend_body
    else -> R.string.keys_earn_generic_body
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

// Mirrors WELCOME_BONUS_KEYS in lib/keys/config.ts — the instant reward for
// verifying. Surfaced as the hero earn path when the wallet is empty.
private const val WELCOME_BONUS_KEYS = 30

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
