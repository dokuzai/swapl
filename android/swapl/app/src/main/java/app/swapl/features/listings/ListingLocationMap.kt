package app.swapl.features.listings

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Polygon

// Approximate-area location map for the listing detail screen. The server fuzzes
// lat/lng to a ~2km area for non-owners (privacy), so we draw a soft circle, not
// a precise pin. The preview is static — touches are swallowed so the page keeps
// scrolling and the exact spot is never explorable.
@Composable
fun ListingLocationMap(lat: Double, lng: Double, modifier: Modifier = Modifier) {
    val ring = MaterialTheme.colorScheme.primary.toArgb() and 0x00FFFFFF
    AndroidView(
        modifier = modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(16.dp)),
        factory = { ctx ->
            MapView(ctx).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setMultiTouchControls(false)
                isHorizontalMapRepetitionEnabled = false
                isVerticalMapRepetitionEnabled = false
                // Static preview: consume touches so the map never pans/zooms.
                setOnTouchListener { _, _ -> true }
                controller.setZoom(13.0)
                val center = GeoPoint(lat, lng)
                controller.setCenter(center)
                val circle = Polygon().apply {
                    points = Polygon.pointsAsCircle(center, 1500.0)
                    fillPaint.color = (0x24 shl 24) or ring   // ~14% alpha
                    outlinePaint.color = (0x73 shl 24) or ring // ~45% alpha
                    outlinePaint.strokeWidth = 3f
                }
                overlays.add(circle)
            }
        },
        onRelease = { it.onDetach() },
    )
}
