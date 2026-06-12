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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.swapl.core.model.DiscoverExperience
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalette
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage

// Experiences tab of Explore (DOK-145): big Airbnb-style cards backed by
// GET /api/discover/experiences. Affiliate links only — no prices, no
// availability. Tap → Custom Tab on the /api/affiliate/{partner} redirect so
// the click is logged before the 302.
@Composable
fun ExperiencesTab(vm: ExperiencesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.load() }

    when {
        state.isLoading && !state.hasLoaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.error != null -> DiscoverMessageState(
            title = "Experiences unavailable",
            description = "We couldn't reach Swapl. Check your connection and try again.",
            actionTitle = "Try Again",
            onAction = { vm.load(force = true) },
        )
        state.items.isEmpty() -> DiscoverMessageState(
            title = "No experiences yet",
            description = "City experiences are coming soon. Check back here before your next swap.",
        )
        else -> LazyColumn(
            contentPadding = PaddingValues(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(state.items, key = { it.url }) { item ->
                ExperienceCard(item) {
                    CustomTabsIntent.Builder().build()
                        .launchUrl(context, Uri.parse(vm.resolveUrl(item.url)))
                }
            }
        }
    }
}

@Composable
private fun ExperienceCard(item: DiscoverExperience, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SwaplRadius.lg))
            .clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        Box {
            ExperiencePhoto(item)
            // Partner badge floating over the photo, Airbnb "Guest favorite"-style.
            Text(
                item.partnerDisplayName,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = Color.Black,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(SwaplSpacing.s3)
                    .background(Color.White, CircleShape)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Column {
            Text(
                item.title,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 2,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                if (item.country.isEmpty()) item.city else "${item.city}, ${item.country}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Book on ${item.partnerDisplayName}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
                Icon(
                    Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.height(14.dp),
                )
            }
        }
    }
}

// City photo from the CityMedia cache; no cached photo (or load error) → the
// brand city illustration, same fallback ladder as ListingPhoto.
@Composable
private fun ExperiencePhoto(item: DiscoverExperience) {
    val shaped = Modifier
        .fillMaxWidth()
        .height(220.dp)
        .clip(RoundedCornerShape(SwaplRadius.lg))
    val palette = paletteFor(item.city)
    if (item.photo?.url.isNullOrBlank()) {
        CityIllustBackdrop(palette, shaped)
    } else {
        SubcomposeAsyncImage(
            model = item.photo?.url,
            contentDescription = item.photo?.alt,
            contentScale = ContentScale.Crop,
            modifier = shaped,
            loading = { CityIllustBackdrop(palette, Modifier.fillMaxSize()) },
            error = { CityIllustBackdrop(palette, Modifier.fillMaxSize()) },
        )
    }
}

// The illustration letterboxes (fixed 200×140 aspect); matching the sky color
// behind it keeps the card looking intentional.
@Composable
private fun CityIllustBackdrop(palette: SwaplCityPalette, modifier: Modifier) {
    Box(modifier.background(palette.sky), contentAlignment = Alignment.Center) {
        CityIllust(palette = palette)
    }
}

// Stable per-city palette pick — FNV-1a (same constants as the iOS card),
// because hashCode is fine here but FNV keeps the two apps coloring each
// city identically.
private fun paletteFor(city: String): SwaplCityPalette {
    val names = listOf("warm", "cool", "rose", "sage", "dusk", "sand", "mono")
    var hash = -3750763034362895579L // FNV-1a 64-bit offset basis
    for (byte in city.lowercase().toByteArray(Charsets.UTF_8)) {
        hash = (hash xor (byte.toLong() and 0xff)) * 1099511628211L
    }
    val index = java.lang.Long.remainderUnsigned(hash, names.size.toLong()).toInt()
    return SwaplCityPalettes.forName(names[index])
}

// Shared empty/error layout for the discover tabs.
@Composable
internal fun DiscoverMessageState(
    title: String,
    description: String,
    actionTitle: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (actionTitle != null && onAction != null) {
            Spacer(Modifier.height(SwaplSpacing.s3))
            TextButton(onClick = onAction) { Text(actionTitle) }
        }
    }
}
