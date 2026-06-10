package app.swapl.features.listings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.core.model.ListingWithScore
import app.swapl.design.components.MatchBadge
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplSpacing

@Composable
fun BrowseScreen(
    onOpen: (String) -> Unit = {},
    onNew: () -> Unit = {},
    onEditOwn: (String) -> Unit = {},
    vm: BrowseViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.padding(SwaplSpacing.s5).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Browse", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
            val ownListingId = state.viewerListingId
            if (ownListingId != null) {
                androidx.compose.material3.TextButton(onClick = { onEditOwn(ownListingId) }) {
                    Text("Edit your home")
                }
            } else {
                androidx.compose.material3.TextButton(onClick = onNew) {
                    Text("+ List a home")
                }
            }
        }
        LazyColumn(
            contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
        ) {
            items(state.items, key = { it.listing.id }) { item ->
                ListingCard(item, onClick = { onOpen(item.listing.id) })
            }
        }
    }
}

@Composable
private fun ListingCard(item: ListingWithScore, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            CityIllust(palette = SwaplCityPalettes.forName(item.listing.palette))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${item.listing.neighbourhood} · ${item.listing.city}",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Spacer(Modifier.height(2.dp()))
                    Text(
                        "${item.listing.sleeps} guests · ${item.listing.sizeSqm} m² · ${item.listing.propertyType.lowercase()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                when {
                    item.matchScore != null -> MatchBadge(item.matchScore)
                    item.band == "featured" -> TagChip("Featured")
                    item.band == "verified" -> TagChip("Verified")
                }
            }
        }
    }
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
