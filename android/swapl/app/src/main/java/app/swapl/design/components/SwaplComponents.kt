package app.swapl.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing

@Composable
fun PrimaryPill(text: String, onClick: () -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Text(text, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(SwaplRadius.lg))
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(SwaplRadius.lg))
            .padding(SwaplSpacing.s5)
    ) { content() }
}

// Maps a server-side swap/agreement status code to a localized display label.
// Logic keeps the raw enum value; only the visible chip text is localized.
// Unknown codes fall through to the raw value (e.g. catalog/subscription data).
@Composable
fun statusTagLabel(status: String): String = when (status.uppercase()) {
    "PENDING" -> stringResource(R.string.status_pending)
    "ACCEPTED", "CONFIRMED" -> stringResource(R.string.status_accepted)
    "COUNTERED" -> stringResource(R.string.status_countered)
    "DECLINED" -> stringResource(R.string.status_declined)
    "WITHDRAWN" -> stringResource(R.string.status_withdrawn)
    "ACTIVE" -> stringResource(R.string.status_active)
    "UPCOMING" -> stringResource(R.string.status_upcoming)
    "IN_PROGRESS" -> stringResource(R.string.status_in_progress)
    "COMPLETED" -> stringResource(R.string.status_completed)
    "CANCELLED", "CANCELED" -> stringResource(R.string.status_cancelled)
    "DISPUTED" -> stringResource(R.string.status_disputed)
    "RESOLVED" -> stringResource(R.string.status_resolved)
    "OPEN" -> stringResource(R.string.status_open)
    else -> status
}

// Convenience: a TagChip whose label is the localized status display name.
@Composable
fun StatusTagChip(status: String) = TagChip(statusTagLabel(status))

@Composable
fun TagChip(label: String) {
    Text(
        label.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = SwaplColors.Navy,
        modifier = Modifier
            .background(SwaplColors.TagBg, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    )
}

// Discreet "Verified owner" trust badge (DOK-162). Shown only when a listing's
// host attested ownership AND an admin approved the proof. It is a fiducia
// signal, never implying swapl checked a deed itself — distinct from the
// identity ("Verified host") badge.
@Composable
fun OwnerVerifiedBadge(modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier
            .background(SwaplColors.TagBg, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Icon(
            Icons.Default.VerifiedUser,
            contentDescription = null,
            tint = SwaplColors.Navy,
            modifier = Modifier.size(14.dp),
        )
        Text(
            stringResource(R.string.owner_verified_badge).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = SwaplColors.Navy,
        )
    }
}

@Composable
fun MatchBadge(percent: Int) {
    Text(
        "${percent}% MATCH",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onPrimary,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .background(MaterialTheme.colorScheme.primary, CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
fun KickerLabel(text: String) {
    Text(
        "§ ${text.uppercase()}",
        style = MaterialTheme.typography.labelMedium,
        color = SwaplColors.Pink,
    )
}
