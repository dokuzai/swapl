package app.swapl.features.swaps

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.swapl.core.model.Agreement
import app.swapl.design.MonoFamily
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing

// Shared between the swap thread and the Trips detail so the agreed state
// (key codes + insurance) renders identically wherever an agreement shows up.
@Composable
fun AgreedPanel(a: Agreement, otherName: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.Navy, RoundedCornerShape(SwaplRadius.lg))
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text("Swap agreed — keys for keys", style = MaterialTheme.typography.displaySmall, color = SwaplColors.Cream)
        Text(
            "Stay between ${a.dateFrom.take(10)} → ${a.dateTo.take(10)} with $otherName.",
            style = MaterialTheme.typography.bodyMedium,
            color = SwaplColors.Cream.copy(alpha = 0.85f),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
            KeyCard("Your code (use at their place)", a.keyCode1, Modifier.weight(1f))
            KeyCard("Their code (guest at your place)", a.keyCode2, Modifier.weight(1f))
        }
        if (a.insurance != null) {
            HorizontalDivider(color = SwaplColors.Cream.copy(alpha = 0.2f))
            Text("Insurance · €${a.insurance.coverageAmount / 1000}k cover", style = MaterialTheme.typography.labelMedium, color = SwaplColors.Cream.copy(alpha = 0.6f))
            Text(a.insurance.policyNumber, style = MaterialTheme.typography.titleLarge, color = SwaplColors.Cream, fontWeight = FontWeight.Medium)
            Text("Auto-issued · 24/7 line +44 800 000 swap", style = MaterialTheme.typography.bodySmall, color = SwaplColors.Cream.copy(alpha = 0.7f))
        }
    }
}

@Composable
private fun KeyCard(title: String, code: String?, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(SwaplColors.Navy2, RoundedCornerShape(SwaplRadius.md))
            .padding(SwaplSpacing.s3),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = MaterialTheme.typography.labelSmall, color = SwaplColors.Cream.copy(alpha = 0.6f))
        Text(
            code ?: "----",
            fontFamily = MonoFamily,
            fontSize = 28.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 4.sp,
            color = SwaplColors.Cream,
        )
    }
}
