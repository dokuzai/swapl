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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
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
                Text(stringResource(R.string.invite_title), style = MaterialTheme.typography.displaySmall)
                Text(
                    stringResource(R.string.invite_intro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HeroCard(dashboard)

            ShareCard(
                dashboard = dashboard,
                onShare = {
                    val link = "$SHARE_ORIGIN/?ref=${dashboard.code}"
                    val message = context.getString(R.string.invite_share_message, dashboard.rewardPerReferral, link)
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.invite_share_subject))
                        putExtra(Intent.EXTRA_TEXT, message)
                    }
                    context.startActivity(Intent.createChooser(intent, context.getString(R.string.invite_share_chooser)))
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
                    stringResource(R.string.invite_hero_kicker),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SwaplColors.Cream.copy(alpha = 0.85f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s5)) {
                HeroStat("${dashboard.keysEarned}", stringResource(R.string.invite_hero_points_earned), Modifier.weight(1f))
                HeroStat("#${dashboard.waitlistPosition}", stringResource(R.string.invite_hero_spot_in_line), Modifier.weight(1f))
            }
            Text(
                stringResource(R.string.invite_hero_body, dashboard.rewardPerReferral),
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
        KickerLabel(stringResource(R.string.invite_referral_link_label))
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
                    Text(stringResource(R.string.invite_share_button), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
        Text(
            stringResource(R.string.invite_share_caption),
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
                Text(stringResource(R.string.invite_to_stay_title), style = MaterialTheme.typography.titleLarge)
                Text(
                    stringResource(R.string.invite_to_stay_subtitle),
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
        KickerLabel(stringResource(R.string.invite_tier_label))
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
                            progress.current?.label ?: stringResource(R.string.invite_tier_not_started),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            progress.current?.perk ?: stringResource(R.string.invite_tier_no_perk),
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
                        pluralStringResource(R.plurals.invite_tier_remaining, next.remaining, next.remaining, next.label),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else if (progress.current != null) {
                    Text(
                        stringResource(R.string.invite_tier_top),
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
        KickerLabel(stringResource(R.string.invite_leaderboard_label))
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
                                stringResource(R.string.invite_you_badge),
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
        KickerLabel(stringResource(R.string.invite_your_invites, invitesSent))
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
            stringResource(R.string.invite_antifarm_note),
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
        Text(stringResource(R.string.invite_error_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.common_try_again)) }
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
    @dagger.hilt.android.qualifiers.ApplicationContext private val appContext: android.content.Context,
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
                            appContext.getString(R.string.invite_err_not_verified)
                        else
                            appContext.getString(R.string.invite_err_not_owner)
                    // Unified cooldown copy (matches web + iOS): make clear it's
                    // a temporary throttle, not a ban.
                    429 -> appContext.getString(R.string.invite_err_cooldown)
                    else -> appContext.getString(R.string.invite_err_generic)
                }
            } catch (t: Throwable) {
                error = t.message ?: appContext.getString(R.string.invite_err_generic)
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
            Text(stringResource(R.string.invite_list_home_title), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(
                stringResource(R.string.invite_list_home_body),
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
            Text(stringResource(R.string.invite_verify_home_title), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(
                stringResource(R.string.invite_verify_home_body),
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
                KickerLabel(stringResource(R.string.invite_inviting_guest_to))
                Text(vm.listingTitle ?: stringResource(R.string.invite_your_home), style = MaterialTheme.typography.displaySmall)
            }

            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Text(stringResource(R.string.invite_friend_email_label), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                androidx.compose.material3.OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.invite_friend_email_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    stringResource(R.string.invite_friend_email_hint),
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
                            Text(stringResource(R.string.invite_ready), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = SwaplColors.Navy)
                        }
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val message = context.getString(R.string.invite_stay_share_message, invite.listing.title, invite.shareUrl)
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.invite_stay_share_subject, invite.listing.title))
                                        putExtra(Intent.EXTRA_TEXT, message)
                                    }
                                    context.startActivity(Intent.createChooser(intent, context.getString(R.string.invite_stay_share_chooser)))
                                }
                                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(SwaplRadius.xl2))
                                .padding(SwaplSpacing.s4),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                            Text(stringResource(R.string.invite_share_link_button), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
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
                        if (vm.isSending) stringResource(R.string.invite_creating) else stringResource(R.string.invite_create_link),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }

            vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Text(
                vm.rewardPerReferral?.let {
                    stringResource(R.string.invite_stay_reward, it)
                } ?: stringResource(R.string.invite_stay_reward_generic),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
