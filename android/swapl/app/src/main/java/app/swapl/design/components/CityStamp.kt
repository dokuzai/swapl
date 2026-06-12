package app.swapl.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.swapl.core.model.VisitedCity
import app.swapl.design.MonoFamily
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing

// Postcard city stamp — Compose port of the web's city-stamp.tsx and the iOS
// CityStamp, the same visual language as the stamp in the corner of the
// browse-card postcards: cream paper, thin navy frame, inner dashed border,
// monospace uppercase city. Used on the public profile's "Where I've been"
// strip, one stamp per visited city + year (from COMPLETED agreements — real
// data only).
@Composable
fun CityStamp(
    city: String,
    country: String,
    year: Int,
    tilt: Float = 0f,
    modifier: Modifier = Modifier,
) {
    // Stamp paper is intentionally a touch whiter than the cream background
    // (#FFFBF3, matching the web component) so it reads as a pasted sticker.
    val paper = Color(0xFFFFFBF3)
    val shadow = SwaplColors.Navy.copy(alpha = 0.12f)
    val dash = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))

    Column(
        modifier = modifier
            .rotate(tilt)
            // The web's hard offset shadow (2px 2px 0, navy 12%).
            .drawBehind {
                translate(left = 2.dp.toPx(), top = 2.dp.toPx()) {
                    drawRoundRect(color = shadow, cornerRadius = CornerRadius(4.dp.toPx()))
                }
            }
            .background(paper, RoundedCornerShape(4.dp))
            .border(1.dp, SwaplColors.Navy, RoundedCornerShape(4.dp))
            .padding(4.dp)
            // Inner dashed frame, like a perforated stamp edge.
            .drawBehind {
                drawRoundRect(
                    color = SwaplColors.Navy3,
                    topLeft = Offset.Zero,
                    size = size,
                    cornerRadius = CornerRadius(2.dp.toPx()),
                    style = Stroke(width = 1.dp.toPx(), pathEffect = dash),
                )
            }
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .widthIn(min = 96.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            city.take(14).uppercase(),
            fontFamily = MonoFamily,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.5.sp,
            color = SwaplColors.Navy,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            "${country.take(14).uppercase()} · $year",
            fontFamily = MonoFamily,
            fontSize = 9.sp,
            letterSpacing = 1.sp,
            color = SwaplColors.Navy3,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// Horizontal "Where I've been" strip: stamps scroll sideways with a slight
// alternating tilt, like stamps inked onto a passport page.
@Composable
fun CityStampStrip(visited: List<VisitedCity>, modifier: Modifier = Modifier) {
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        // Breathing room so tilted corners and the offset shadow don't clip.
        contentPadding = PaddingValues(vertical = 6.dp, horizontal = 2.dp),
    ) {
        itemsIndexed(visited) { index, stop ->
            CityStamp(
                city = stop.city,
                country = stop.country,
                year = stop.year,
                tilt = if (index % 2 == 0) -2f else 1.5f,
            )
        }
    }
}
