package app.swapl.features.placeholder

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Luggage
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.swapl.designtokens.SwaplSpacing

// Same placeholder tabs iOS ships (Wishlists / Trips stubs) so the tab
// structure matches across platforms until the features land.

@Composable
fun WishlistsScreen() {
    PlaceholderBody(
        icon = Icons.Default.FavoriteBorder,
        title = "Wishlists",
        body = "Saved homes will appear here. Tap the heart on any listing to keep it for later.",
    )
}

@Composable
fun TripsScreen() {
    PlaceholderBody(
        icon = Icons.Default.Luggage,
        title = "Trips",
        body = "Accepted swaps become trips. Your upcoming stays will show up here.",
    )
}

@Composable
private fun PlaceholderBody(icon: ImageVector, title: String, body: String) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(SwaplSpacing.s4))
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
