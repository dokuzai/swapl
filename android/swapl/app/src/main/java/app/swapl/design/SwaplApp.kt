package app.swapl.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.swapl.designtokens.SwaplFontFamily
import app.swapl.designtokens.SwaplSemanticDark
import app.swapl.designtokens.SwaplSemanticLight

// Bridges the generated SwaplTokens onto Material3's ColorScheme so any
// Material component automatically picks up the swapl palette without a
// per-call color override.

private val LightSwaplColors = lightColorScheme(
    primary = SwaplSemanticLight.Primary,
    onPrimary = SwaplSemanticLight.PrimaryForeground,
    secondary = SwaplSemanticLight.Secondary,
    onSecondary = SwaplSemanticLight.SecondaryForeground,
    background = SwaplSemanticLight.Background,
    onBackground = SwaplSemanticLight.Foreground,
    surface = SwaplSemanticLight.Card,
    onSurface = SwaplSemanticLight.CardForeground,
    surfaceVariant = SwaplSemanticLight.Muted,
    onSurfaceVariant = SwaplSemanticLight.MutedForeground,
    error = SwaplSemanticLight.Destructive,
    outline = SwaplSemanticLight.Border,
)

private val DarkSwaplColors = darkColorScheme(
    primary = SwaplSemanticDark.Primary,
    onPrimary = SwaplSemanticDark.PrimaryForeground,
    secondary = SwaplSemanticDark.Secondary,
    onSecondary = SwaplSemanticDark.SecondaryForeground,
    background = SwaplSemanticDark.Background,
    onBackground = SwaplSemanticDark.Foreground,
    surface = SwaplSemanticDark.Card,
    onSurface = SwaplSemanticDark.CardForeground,
    surfaceVariant = SwaplSemanticDark.Muted,
    onSurfaceVariant = SwaplSemanticDark.MutedForeground,
    error = SwaplSemanticDark.Destructive,
    outline = SwaplSemanticDark.Border,
)

// Place TTFs in res/font/ named to match SwaplFontFamily constants.
val DisplayFamily = FontFamily(Font(resourceId = R.font.fraunces))
val BodyFamily = FontFamily(Font(resourceId = R.font.inter))
val MonoFamily = FontFamily(Font(resourceId = R.font.jetbrains_mono))

private val SwaplTypography = Typography(
    displayLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Medium, fontSize = 56.sp, letterSpacing = (-0.02).sp),
    displayMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Medium, fontSize = 40.sp, letterSpacing = (-0.02).sp),
    displaySmall = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Medium, fontSize = 28.sp, letterSpacing = (-0.02).sp),
    headlineMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Medium, fontSize = 24.sp),
    titleLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Medium, fontSize = 20.sp),
    bodyLarge = TextStyle(fontFamily = BodyFamily, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = BodyFamily, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = BodyFamily, fontSize = 13.sp),
    labelMedium = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, letterSpacing = 0.14.sp),
    labelSmall = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, letterSpacing = 0.06.sp),
)

@Composable
fun SwaplApp(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkSwaplColors else LightSwaplColors,
        typography = SwaplTypography,
    ) {
        Surface(color = MaterialTheme.colorScheme.background) { content() }
    }
}
