package app.swapl.design.illustrations

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import app.swapl.designtokens.SwaplCityPalette

// Compose port of the SVG CityIllust used on listing cards.
// Same proportions as the SwiftUI version (200×140) and the web SVG.
@Composable
fun CityIllust(palette: SwaplCityPalette, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.aspectRatio(200f / 140f)) {
        val w = size.width
        val h = size.height
        // Sky
        drawRect(palette.sky, size = size)
        // Ground
        val groundY = h * 0.78f
        drawRect(palette.roof.copy(alpha = 0.18f), topLeft = Offset(0f, groundY), size = Size(w, h - groundY))

        val buildings = listOf(
            Triple(0.10f, 0.18f, 0.42f),
            Triple(0.30f, 0.22f, 0.55f),
            Triple(0.55f, 0.18f, 0.34f),
            Triple(0.74f, 0.20f, 0.50f),
        )
        for ((x, bw, bh) in buildings) {
            val rectX = w * x
            val rectY = groundY - h * bh
            val rectW = w * bw
            val rectH = h * bh
            drawRect(palette.building, Offset(rectX, rectY), Size(rectW, rectH))
            // Windows: 3x3 dots
            for (r in 1..3) for (c in 1..3) {
                val cx = rectX + (rectW / 4f) * c
                val cy = rectY + (rectH / 4f) * r
                drawRect(palette.window, Offset(cx - 1.5f, cy - 1.5f), Size(3f, 3f))
            }
            // Roof shadow
            drawRect(palette.roof, Offset(rectX, rectY), Size(rectW, 4f))
        }
        // Sun / accent
        drawCircle(palette.accent, radius = 11f, center = Offset(w * 0.83f, h * 0.18f))
    }
}
