package app.swapl.features.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.auth.AuthViewModel
import app.swapl.core.model.MeResponse
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AccountOverviewViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    var me by mutableStateOf<MeResponse?>(null); private set
    fun load() = viewModelScope.launch { runCatching { me = repo.me() } }
}

@Composable
fun AccountScreen(
    onOpenInterests: () -> Unit = {},
    onOpenSavedSearches: () -> Unit = {},
    onOpenPublicProfile: (String) -> Unit = {},
    authVm: AuthViewModel = hiltViewModel(),
    overview: AccountOverviewViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { overview.load() }
    val s = authVm.uiState.session

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        if (s != null) {
            KickerLabel("Account")
            Text(s.name ?: s.email, style = MaterialTheme.typography.displaySmall)
            Text(s.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        overview.me?.let { me ->
            SurfaceCard {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    KickerLabel("Overview")
                    StatRow("Waiting on you", me.counts.incomingProposals)
                    StatRow("Sent — awaiting reply", me.counts.outgoingProposals)
                    StatRow("Active swaps", me.counts.activeSwaps, accent = true)
                    StatRow("Your listings", me.counts.listings)
                }
            }
            me.subscription?.let { sub ->
                SurfaceCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            KickerLabel("Plan")
                            Text(sub.planId.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.titleLarge)
                        }
                        TagChip(sub.status)
                    }
                }
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        AccountLink("Interests", onClick = onOpenInterests)
        AccountLink("Public profile", onClick = { s?.id?.let(onOpenPublicProfile) })
        AccountLink("Saved searches", onClick = onOpenSavedSearches)

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        TextButton(onClick = { authVm.signOut() }) {
            Text("Sign out", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int, accent: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(
            value.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = if (accent) SwaplColors.Pink else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun AccountLink(label: String, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = SwaplSpacing.s3),
    )
}
