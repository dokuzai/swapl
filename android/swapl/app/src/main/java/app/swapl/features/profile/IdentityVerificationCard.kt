package app.swapl.features.profile

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewModelScope
import androidx.compose.ui.res.stringResource
import app.swapl.R
import app.swapl.core.repository.ReferralReward
import app.swapl.core.repository.VerificationRepository
import app.swapl.core.repository.VerificationStatus
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.launch
import javax.inject.Inject

// "Verify your identity" card for AccountScreen — Didit hosted verification.
//
// Hidden unless GET /api/verification/status says the feature is enabled AND
// the user isn't verified yet (env-gated, never broken). Tapping it mints a
// hosted Didit session and opens it in a Custom Tab; when the user comes back
// (ON_RESUME) we re-poll status so the card disappears once approved.

@HiltViewModel
class IdentityVerificationViewModel @Inject constructor(
    private val repo: VerificationRepository,
) : ViewModel() {
    var status by mutableStateOf<VerificationStatus?>(null)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    // Post-verify referral reward to surface once via a snackbar. Cleared by
    // the UI after it's shown so it doesn't re-fire on recomposition.
    var pendingReward by mutableStateOf<ReferralReward?>(null)
        private set

    // Only re-poll on resume when we actually sent the user out to Didit —
    // otherwise every screen entry would fetch twice.
    private var awaitingReturn = false

    fun load() {
        viewModelScope.launch {
            runCatching {
                val fresh = repo.status()
                status = fresh
                val reward = fresh.referralReward
                if (reward != null && reward.keys > 0) pendingReward = reward
            }
        }
    }

    fun consumeReward() {
        pendingReward = null
    }

    fun refreshAfterReturn() {
        if (!awaitingReturn) return
        awaitingReturn = false
        load()
    }

    fun start(openUrl: (String) -> Unit) {
        if (busy) return
        busy = true
        error = null
        viewModelScope.launch {
            try {
                val started = repo.createSession()
                val url = started.url
                when {
                    started.status == "approved" -> load()
                    url != null -> {
                        awaitingReturn = true
                        openUrl(url)
                    }
                    else -> error = "Verification is unavailable right now. Try again later."
                }
            } catch (t: ResponseException) {
                when (t.response.status.value) {
                    // Feature switched off server-side since the status fetch — hide.
                    503 -> status = null
                    429 -> error = "Too many attempts — try again later."
                    else -> error = "Could not start verification. Try again."
                }
            } catch (_: Throwable) {
                error = "Could not start verification. Try again."
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun IdentityVerificationCard(
    vm: IdentityVerificationViewModel = hiltViewModel(),
    onReward: (String) -> Unit = {},
) {
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.load() }
    LifecycleResumeEffect(Unit) {
        vm.refreshAfterReturn()
        onPauseOrDispose { }
    }

    // Post-verify referral toast: fire once when the status carries a paid
    // reward, even though the card itself hides on `verified`.
    val reward = vm.pendingReward
    val rewardNamed = stringResource(R.string.verify_referral_toast_named)
    val rewardPlain = stringResource(R.string.verify_referral_toast)
    LaunchedEffect(reward) {
        val r = reward ?: return@LaunchedEffect
        val msg = r.referrerName?.let { name -> rewardNamed.format(name, r.keys) }
            ?: rewardPlain.format(r.keys)
        onReward(msg)
        vm.consumeReward()
    }

    val status = vm.status ?: return
    if (!status.enabled || status.verified) return

    SurfaceCard(
        modifier = Modifier.clickable(enabled = !vm.busy) {
            vm.start { url ->
                CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
            }
        },
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
            ) {
                Icon(
                    Icons.Default.VerifiedUser,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Column {
                    Text(
                        when (status.status) {
                            "pending" -> "Finish verifying your identity"
                            "declined" -> "Verification didn't go through"
                            else -> "Verify your identity"
                        },
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        when (status.status) {
                            "pending" -> "Pick up where you left off — it takes about two minutes."
                            "declined" -> "You can try again with a clearer photo of your ID."
                            else -> "Get the ID-verified badge hosts trust. Takes about two minutes."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            vm.error?.let {
                Spacer(Modifier.height(SwaplSpacing.s2))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
