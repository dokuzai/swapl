package app.swapl.design.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Shared heart toggle used on browse cards, wishlist cards and listing detail,
// mirroring iOS's FavoriteHeartButton. Stateless: callers read the shared
// FavoritesStore through their view model and pass isFavorite/onToggle down.
// The translucent scrim keeps the unfilled white heart legible over photos.
@Composable
fun FavoriteHeartButton(
    isFavorite: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
) {
    val tint by animateColorAsState(
        targetValue = if (isFavorite) MaterialTheme.colorScheme.primary else Color.White,
        label = "favoriteTint",
    )
    IconButton(
        onClick = onToggle,
        modifier = modifier.background(Color.Black.copy(alpha = 0.25f), CircleShape),
    ) {
        Icon(
            if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
            contentDescription = if (isFavorite) "Remove from wishlist" else "Save to wishlist",
            tint = tint,
            modifier = Modifier.size(size),
        )
    }
}
