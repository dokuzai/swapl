package app.swapl.design.components

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.swapl.design.illustrations.CityIllust
import app.swapl.designtokens.SwaplCityPalettes
import app.swapl.designtokens.SwaplRadius
import coil3.compose.SubcomposeAsyncImage

// Listing imagery with the same fallback ladder as iOS's ListingPhotoView:
// first photo URL if present, procedural CityIllust otherwise (and on error).
@Composable
fun ListingPhoto(
    photoUrl: String?,
    palette: String,
    modifier: Modifier = Modifier,
    height: Dp = 200.dp,
    cornerRadius: Dp = SwaplRadius.lg,
) {
    val shaped = modifier
        .fillMaxWidth()
        .height(height)
        .clip(RoundedCornerShape(cornerRadius))
    if (photoUrl.isNullOrBlank()) {
        CityIllust(palette = SwaplCityPalettes.forName(palette), modifier = shaped)
    } else {
        SubcomposeAsyncImage(
            model = photoUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = shaped,
            loading = { CityIllust(palette = SwaplCityPalettes.forName(palette), modifier = Modifier.fillMaxSize()) },
            error = { CityIllust(palette = SwaplCityPalettes.forName(palette), modifier = Modifier.fillMaxSize()) },
        )
    }
}
