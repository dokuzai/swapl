package app.swapl.features.swaps

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing

// "Leave a review" dialog (DOK-147) — shown from the swap thread / trip
// detail when the server says canReview (agreement COMPLETED, no review from
// the caller yet). Stars 1-5 + free text (20-1000 chars, mirroring the API),
// POST /api/agreements/{id}/review via the caller's view model.
@Composable
fun LeaveReviewDialog(
    otherName: String?,
    isSubmitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (rating: Int, text: String) -> Unit,
) {
    var rating by remember { mutableIntStateOf(0) }
    var text by remember { mutableStateOf("") }
    val trimmed = text.trim()
    val isValid = rating in 1..5 && trimmed.length in 20..1000
    val partnerName = otherName ?: stringResource(R.string.review_partner_fallback)

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.review_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Text(
                    stringResource(R.string.review_prompt, partnerName),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                KickerLabel(stringResource(R.string.review_rating_label))
                val ratingCd = stringResource(R.string.cd_rating_out_of_5, rating)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                    modifier = Modifier.semantics { contentDescription = ratingCd },
                ) {
                    (1..5).forEach { n ->
                        Icon(
                            if (n <= rating) Icons.Default.Star else Icons.Default.StarBorder,
                            contentDescription = pluralStringResource(R.plurals.cd_n_stars, n, n),
                            tint = if (n <= rating) SwaplColors.Pink else SwaplColors.Cream2,
                            modifier = Modifier
                                .size(36.dp)
                                .clickable(enabled = !isSubmitting) { rating = n },
                        )
                    }
                }
                KickerLabel(stringResource(R.string.review_text_label))
                OutlinedTextField(
                    text,
                    { text = it },
                    placeholder = { Text(stringResource(R.string.review_text_placeholder)) },
                    enabled = !isSubmitting,
                    supportingText = {
                        if (trimmed.isNotEmpty() && trimmed.length < 20) {
                            Text(stringResource(R.string.review_min_chars, trimmed.length))
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp),
                )
                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = isValid && !isSubmitting,
                onClick = { onSubmit(rating, trimmed) },
            ) { Text(if (isSubmitting) stringResource(R.string.review_submitting) else stringResource(R.string.review_submit)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text(stringResource(R.string.common_cancel)) }
        },
    )
}

// After a COMPLETED swap, the server flags canReview until the caller has
// left their (single) review — the card mirrors the web thread's CTA.
@Composable
fun LeaveReviewCard(otherName: String?, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        ) {
            Icon(
                Icons.Default.RateReview,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column {
                Text(stringResource(R.string.review_card_title), style = MaterialTheme.typography.titleLarge)
                Text(
                    stringResource(R.string.review_card_body, otherName ?: stringResource(R.string.review_partner_fallback)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
