package app.swapl.features.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Listing
import app.swapl.core.model.PublicProfile
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PublicProfileViewModel @Inject constructor(
    private val repo: ProfileRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val userId: String = checkNotNull(savedState["userId"])
    var profile by mutableStateOf<PublicProfile?>(null); private set
    fun load() = viewModelScope.launch { runCatching { profile = repo.publicProfile(userId) } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PublicProfileScreen(
    onOpenListing: (String) -> Unit = {},
    vm: PublicProfileViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val p = vm.profile
    var showReport by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        if (p != null) {
            KickerLabel("Member since ${p.user.memberSince.take(7)}")
            Text(p.user.name ?: "Anonymous host", style = MaterialTheme.typography.displayMedium)
            if (p.user.verified) TagChip("ID verified")
            p.user.bioVibe?.takeIf { it.isNotEmpty() }?.let {
                Text("“$it”", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Pink, fontStyle = FontStyle.Italic)
            }
            p.user.bio?.takeIf { it.isNotEmpty() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }

            if (p.user.interests.isNotEmpty()) {
                KickerLabel("Interests")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    p.user.interests.forEach { TagChip(it) }
                }
            }
            if (p.listings.isNotEmpty()) {
                KickerLabel("Their homes")
                p.listings.forEach { l -> ListingThumbnail(l, onClick = { onOpenListing(l.id) }) }
            }

            TextButton(onClick = { showReport = true }) {
                Text("Report this user", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showReport && p != null) {
        ReportDialog(targetUserId = p.user.id, listingId = null, onDismiss = { showReport = false })
    }
}

@Composable
private fun ListingThumbnail(l: Listing, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            CityIllust(palette = SwaplCityPalettes.forName(l.palette))
            Text("${l.neighbourhood} · ${l.city}", style = MaterialTheme.typography.titleLarge)
            Text("${l.sizeSqm} m² · sleeps ${l.sleeps}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
