package app.swapl.features.referrals

import android.content.Intent
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Houseboat
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.ReferralDashboard
import app.swapl.core.repository.ReferralRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.launch
import javax.inject.Inject

// Invite & earn (DOK-157). Reached from Account → "Invite & earn". The member
// shares their code or link with one tap (Android share Intent), watches their
// tier progress and waitlist position climb, sees the anonymised leaderboard, and
// gets an "Invite someone to stay" CTA tied to their own home. Copy is "travel
// points", never money — the reward only lands when an invited friend verifies
// their identity. Mirrors the iOS InviteAndEarnView and web /account/invite.

// Universal-link share origin — the same domain the listing share sheet uses. The
// server returns shareUrl pointing at localhost in dev, so we rebuild the link
// from the code for one that always works off-device.
private const val SHARE_ORIGIN = "https://app.swapl.fun"

@HiltViewModel
class InviteAndEarnViewModel @Inject constructor(private val repo: ReferralRepository) : ViewModel() {
    var dashboard by mutableStateOf<ReferralDashboard?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { dashboard = repo.dashboard() }
            .onFailure { if (dashboard == null) error = it.message }
    }
}

@Composable
fun InviteAndEarnScreen(
    onOpenInviteToStay: () -> Unit = {},
    vm: InviteAndEarnViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val context = LocalContext.current

    val dashboard = vm.dashboard
    when {
        dashboard == null && vm.error != null -> ErrorState(vm.error!!, onRetry = { vm.load() })
        dashboard == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
                Text("Invite & earn", style = MaterialTheme.typography.displaySmall)
                Text(
                    "Bring friends, earn travel points, climb the early-access line. Points are never money.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HeroCard(dashboard)

            ShareCard(
                dashboard = dashboard,
                onShare = {
                    val link = "$SHARE_ORIGIN/?ref=${dashboard.code}"
                    val message = "Join me on Swapl — swap homes and travel on points, not cash. " +
                        "Use my link and we both score ${dashboard.rewardPerReferral} travel points when you verify: $link"
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Join me on Swapl")
                        putExtra(Intent.EXTRA_TEXT, message)
                    }
                    context.startActivity(Intent.createChooser(intent, "Share your invite"))
                },
            )

            InviteToStayEntry(onClick = onOpenInviteToStay)

            TierCard(dashboard.tierProgress)

            if (dashboard.leaderboardTop.isNotEmpty()) {
                LeaderboardCard(dashboard.leaderboardTop)
            }

            if (dashboard.joined.isNotEmpty()) {
                JoinedCard(dashboard.invitesSent, dashboard.joined)
            }

            AntiFarmNote()

            Spacer(Modifier.height(SwaplSpacing.s4))
        }
    }
}

// Hero — points earned + waitlist position (the FOMO headline).
@Composable
private fun HeroCard(dashboard: ReferralDashboard) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.NavyDark, RoundedCornerShape(SwaplRadius.xl))
            .padding(SwaplSpacing.s5),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(Icons.Default.Bolt, contentDescription = null, tint = SwaplColors.Cream)
                Text(
                    "Bring friends, climb the line",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SwaplColors.Cream.copy(alpha = 0.85f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s5)) {
                HeroStat("${dashboard.keysEarned}", "points earned", Modifier.weight(1f))
                HeroStat("#${dashboard.waitlistPosition}", "your spot in line", Modifier.weight(1f))
            }
            Text(
                "Every friend who joins and verifies earns you ${dashboard.rewardPerReferral} travel points — and bumps you up the early-access line. Points are never money.",
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Cream.copy(alpha = 0.85f),
            )
        }
    }
}

@Composable
private fun HeroStat(value: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
        Text(value, style = MaterialTheme.typography.displayMedium, color = SwaplColors.Cream)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = SwaplColors.Cream.copy(alpha = 0.85f),
        )
    }
}

// Share — the code + one-tap Android share Intent.
@Composable
private fun ShareCard(dashboard: ReferralDashboard, onShare: () -> Unit) {
    // The ONE pre-formatted link we surface (not the bare code), so people don't
    // copy just "KWJ3YMF" and wonder whether they also need a URL. Displayed
    // without the scheme for readability; the share Intent sends the full link.
    val link = "$SHARE_ORIGIN/?ref=${dashboard.code}"
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        KickerLabel("Your referral link")
        Box(
            Modifier
                .fillMaxWidth()
                .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.lg))
                .padding(SwaplSpacing.s4),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Text(
                    link.removePrefix("https://"),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = SwaplColors.Navy,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    Modifier
                        .clickable(onClick = onShare)
                        .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(SwaplRadius.xl2))
                        .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                    Text("Share", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
        Text(
            "Share this whole link — it's what counts. One tap sends it anywhere: Messages, WhatsApp, email. Your friend taps it, joins, and once they verify you both get points.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// Invite someone to stay — the headline CTA tied to the host's home.
@Composable
private fun InviteToStayEntry(onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Icon(Icons.Default.Houseboat, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f)) {
                Text("Invite someone to stay", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Send a personal invite tied to your home",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Tier progress — current badge + a progress bar to the next tier.
@Composable
private fun TierCard(progress: ReferralDashboard.TierProgress) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Your tier")
        SurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    Box(
                        Modifier
                            .size(48.dp)
                            .background(SwaplColors.TagBg, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.WorkspacePremium, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            progress.current?.label ?: "Not started",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            progress.current?.perk ?: "Invite your first friend to unlock perks.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                val next = progress.next
                if (next != null) {
                    val done = (next.threshold - next.remaining).coerceAtLeast(0)
                    LinearProgressIndicator(
                        progress = { done.toFloat() / next.threshold.coerceAtLeast(1).toFloat() },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        if (next.remaining == 1) "1 more verified friend to reach ${next.label}."
                        else "${next.remaining} more verified friends to reach ${next.label}.",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else if (progress.current != null) {
                    Text(
                        "Top tier reached — you're a Swapl founder.",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

// Leaderboard — anonymised top referrers, the caller flagged.
@Composable
private fun LeaderboardCard(entries: List<ReferralDashboard.LeaderboardEntry>) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Leaderboard")
        SurfaceCard {
            Column {
                entries.forEachIndexed { index, entry ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = SwaplSpacing.s2),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                    ) {
                        Text(
                            "${entry.rank}",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (entry.rank <= 3) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp),
                        )
                        Text(
                            entry.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (entry.isYou) FontWeight.Bold else FontWeight.SemiBold,
                        )
                        if (entry.isYou) {
                            Text(
                                "YOU",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier
                                    .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.sm))
                                    .padding(horizontal = SwaplSpacing.s2, vertical = 2.dp),
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Text(
                            "${entry.qualified}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    if (index < entries.lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
}

// Who's joined — invitees with their verification status.
@Composable
private fun JoinedCard(invitesSent: Int, joined: List<ReferralDashboard.JoinedReferral>) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Your invites ($invitesSent)")
        SurfaceCard {
            Column {
                joined.forEachIndexed { index, join ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = SwaplSpacing.s2),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                    ) {
                        Icon(
                            if (join.isQualified) Icons.Default.CheckCircle else Icons.Default.HourglassEmpty,
                            contentDescription = null,
                            tint = if (join.isQualified) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(22.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(join.displayName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                join.statusLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            join.sourceLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (index < joined.lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
}

@Composable
private fun AntiFarmNote() {
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        Icon(
            Icons.Default.Shield,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Text(
            "Points land only once a friend verifies their identity — that keeps the line fair for everyone. Points are travel credit, never cash.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
        Text("Invites unavailable", style = MaterialTheme.typography.titleLarge)
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

// ---- Invite to stay -------------------------------------------------------

// Issues an invitation tied to one of the member's own listings (DOK-157). We
// resolve the caller's active listing first; the resulting share link carries an
// opaque token that auto-links the invitee on signup (source=invite_to_stay).
// Mirrors the iOS InviteToStaySheet.
@HiltViewModel
class InviteToStayViewModel @Inject constructor(
    private val referrals: ReferralRepository,
    private val listings: app.swapl.core.repository.ListingRepository,
) : ViewModel() {
    var listingTitle by mutableStateOf<String?>(null); private set
    var listingId by mutableStateOf<String?>(null); private set
    // An invite from an unverified listing would leave the friend's reward
    // unpayable (the API rejects it), so we gate the flow on this.
    var listingVerified by mutableStateOf(false); private set
    var invite by mutableStateOf<app.swapl.core.model.InviteToStayResponse?>(null); private set
    var error by mutableStateOf<String?>(null); private set
    var isLoadingListing by mutableStateOf(true); private set
    var isSending by mutableStateOf(false); private set
    var rewardPerReferral by mutableStateOf<Int?>(null); private set

    fun loadListing() = viewModelScope.launch {
        isLoadingListing = true
        // Best-effort: surface the live per-referral reward without failing the
        // listing load. A failure here just keeps the generic copy.
        if (rewardPerReferral == null) {
            runCatching { rewardPerReferral = referrals.dashboard().rewardPerReferral }
        }
        runCatching {
            val id = listings.search(app.swapl.core.repository.SearchFilters()).viewerListingId
            listingId = id
            if (id != null) {
                val l = listings.detail(id).listing
                listingTitle = l.title
                listingVerified = l.isVerified
            }
        }.onFailure { error = it.message }
        isLoadingListing = false
    }

    fun createInvite(email: String) {
        val id = listingId ?: return
        if (isSending) return
        viewModelScope.launch {
            isSending = true; error = null
            val trimmed = email.trim()
            try {
                invite = referrals.inviteToStay(id, trimmed.ifEmpty { null })
            } catch (t: io.ktor.client.plugins.ClientRequestException) {
                error = when (t.response.status.value) {
                    // The route returns code `listing_not_verified` when the
                    // listing isn't verified; otherwise it's an ownership reject.
                    403 ->
                        if (t.response.bodyAsText().contains("listing_not_verified"))
                            "Verify this listing before inviting guests to stay — otherwise your friend's reward can't be paid out."
                        else
                            "You can only invite guests to your own listing."
                    // Unified cooldown copy (matches web + iOS): make clear it's
                    // a temporary throttle, not a ban.
                    429 -> "You've sent a lot of invites in the last hour — try again in a bit. It's a quick cooldown, not a ban."
                    else -> "Couldn't create the invite right now."
                }
            } catch (t: Throwable) {
                error = t.message ?: "Couldn't create the invite right now."
            } finally {
                isSending = false
            }
        }
    }
}

@Composable
fun InviteToStayScreen(vm: InviteToStayViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.loadListing() }
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }

    when {
        vm.isLoadingListing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        vm.listingId == null -> Column(
            Modifier.fillMaxSize().padding(SwaplSpacing.s8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("List your home first", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(
                "Invite-to-stay links are tied to your own listing. Create a home in Account, then invite a friend to come stay.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        !vm.listingVerified -> Column(
            // An invite from an unverified listing would leave the friend's
            // reward unpayable (the API rejects it), so block the flow here.
            Modifier.fillMaxSize().padding(SwaplSpacing.s8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Verify your home first", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(
                "Verify this listing before inviting guests to stay — otherwise your friend's reward can't be paid out. Verify it from Account → your listing.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        else -> Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(SwaplSpacing.s4),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                KickerLabel("Inviting a guest to")
                Text(vm.listingTitle ?: "Your home", style = MaterialTheme.typography.displaySmall)
            }

            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Text("Friend's email (optional)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                androidx.compose.material3.OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    singleLine = true,
                    placeholder = { Text("friend@email.com") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Add an email to auto-match the invite when they sign up, or leave it blank for an open link anyone can use.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            val invite = vm.invite
            if (invite != null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.lg))
                        .padding(SwaplSpacing.s4),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Text("Invite ready", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = SwaplColors.Navy)
                        }
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val message = "I'd love to host you on Swapl — swap homes and travel on points, not cash. " +
                                        "Here's your invite to stay at ${invite.listing.title}: ${invite.shareUrl}"
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_SUBJECT, "Come stay at ${invite.listing.title}")
                                        putExtra(Intent.EXTRA_TEXT, message)
                                    }
                                    context.startActivity(Intent.createChooser(intent, "Share invite link"))
                                }
                                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(SwaplRadius.xl2))
                                .padding(SwaplSpacing.s4),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                            Text("Share invite link", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                        }
                    }
                }
            } else {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !vm.isSending) { vm.createInvite(email) }
                        .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(SwaplRadius.xl2))
                        .padding(SwaplSpacing.s4),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        if (vm.isSending) "Creating…" else "Create invite link",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }

            vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Text(
                vm.rewardPerReferral?.let {
                    "When they join and verify, you both earn $it travel points. Points are never money."
                } ?: "When they join and verify, you both earn travel points. Points are never money.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
