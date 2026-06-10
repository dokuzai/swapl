package app.swapl.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.swapl.R
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

// Variable TTFs in res/font/ — the same files iOS bundles, instantiated per
// weight via fvar axis settings (minSdk 26 supports variable fonts).
@OptIn(ExperimentalTextApi::class)
private fun variableFont(resId: Int, weight: FontWeight, style: FontStyle = FontStyle.Normal) =
    Font(resId, weight = weight, style = style, variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)))

@OptIn(ExperimentalTextApi::class)
val DisplayFamily = FontFamily(
    variableFont(R.font.fraunces_variable, FontWeight.Normal),
    variableFont(R.font.fraunces_variable, FontWeight.Medium),
    variableFont(R.font.fraunces_variable, FontWeight.SemiBold),
    variableFont(R.font.fraunces_italic_variable, FontWeight.Normal, FontStyle.Italic),
    variableFont(R.font.fraunces_italic_variable, FontWeight.Medium, FontStyle.Italic),
)

@OptIn(ExperimentalTextApi::class)
val BodyFamily = FontFamily(
    variableFont(R.font.inter_variable, FontWeight.Normal),
    variableFont(R.font.inter_variable, FontWeight.Medium),
    variableFont(R.font.inter_variable, FontWeight.SemiBold),
    variableFont(R.font.inter_variable, FontWeight.Bold),
)

@OptIn(ExperimentalTextApi::class)
val MonoFamily = FontFamily(
    variableFont(R.font.jetbrains_mono_variable, FontWeight.Normal),
    variableFont(R.font.jetbrains_mono_variable, FontWeight.Medium),
)

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
