package app.swapl.features.discover

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.RoomService
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.swapl.core.model.DiscoverService
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing

// Services tab of Explore (DOK-145): the travel-services catalogue from
// GET /api/discover/services — configured affiliate partners (click-through
// via /api/affiliate/{partner} in a Custom Tab so the click is logged) plus
// concierge add-ons with their real DB prices. Nothing configured → clean
// empty state.
@Composable
fun ServicesTab(vm: ServicesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.load() }

    when {
        state.isLoading && !state.hasLoaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.error != null -> DiscoverMessageState(
            title = "Services unavailable",
            description = "We couldn't reach Swapl. Check your connection and try again.",
            actionTitle = "Try Again",
            onAction = { vm.load(force = true) },
        )
        state.items.isEmpty() -> DiscoverMessageState(
            title = "No services yet",
            description = "Travel services and concierge extras will appear here soon.",
        )
        else -> LazyColumn(
            contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(state.items, key = { it.key }) { item ->
                ServiceCard(item) {
                    val raw = item.url ?: return@ServiceCard
                    CustomTabsIntent.Builder().build()
                        .launchUrl(context, Uri.parse(vm.resolveUrl(raw)))
                }
            }
        }
    }
}

@Composable
private fun ServiceCard(item: DiscoverService, onClick: () -> Unit) {
    // Concierge add-ons have no click-through (their checkout lives in the
    // swap flow) — render them as plain cards, not buttons.
    val clickable = if (item.url != null) Modifier.clickable(onClick = onClick) else Modifier
    SurfaceCard(modifier = clickable) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    iconFor(item.iconHint),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Column(Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    Text(
                        item.name,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                    )
                    if (item.isConcierge) TagChip("Concierge")
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    item.tagline,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
                val price = item.formattedPrice
                if (price != null) {
                    // Real catalogue price from the DB — concierge only.
                    Spacer(Modifier.height(4.dp))
                    Text(
                        price,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                    )
                } else if (item.url != null) {
                    Spacer(Modifier.height(4.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            "Book on ${item.name}",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                        Icon(
                            Icons.AutoMirrored.Filled.OpenInNew,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                }
            }
        }
    }
}

// Maps the server's `iconHint` (a hint, never a URL) onto a Material icon —
// same mapping as iOS's SF Symbol switch.
private fun iconFor(hint: String): ImageVector = when (hint) {
    "plane" -> Icons.Default.Flight
    "sim" -> Icons.Default.SimCard
    "ticket" -> Icons.Default.ConfirmationNumber
    "shield" -> Icons.Default.Shield
    "sparkles" -> Icons.Default.AutoAwesome
    "key" -> Icons.Default.Key
    "car" -> Icons.Default.DirectionsCar
    "map" -> Icons.Default.Map
    "concierge" -> Icons.Default.RoomService
    else -> Icons.Default.AutoAwesome
}
