package app.swapl.features.listings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.MeetingRoom
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.core.model.ValuationExplanation
import app.swapl.core.model.ValuationFactor
import app.swapl.design.components.KickerLabel
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import kotlin.math.roundToInt

// Display-only mirror of the backend valuation tunables
// (lib/ai/listing-valuation.ts, lib/keys/value.ts, lib/keys/valuation.ts) so the
// copy can state the real mechanics. The backend still owns every number.
private const val AI_FEATURE_BONUS_MAX = 3
private const val FEEDBACK_MIN_REVIEWS = 3
private const val FEEDBACK_BAND_PCT = 20
private const val FEEDBACK_STEP_PCT = 5

// "How your nightly Keys are calculated" (DOK-163). OWNER-ONLY: the structured
// valuationExplanation is withheld by the server for non-owners, so this is only
// rendered on the owner's own listing (manage view). It renders the persisted
// value plus its breakdown — the client never recomputes nightly Keys.
//
// Tone: reassuring and concrete. The owner should come away feeling the value is
// FAIR (set from features, not bid up) and STABLE (review feedback is bounded to
// ±20% and moves in small steps, so it never swings overnight).
@Composable
fun NightlyKeysExplainer(
    explanation: ValuationExplanation,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(SwaplColors.TagBg, RoundedCornerShape(SwaplRadius.lg))
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        // Headline value.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            Icon(
                Icons.Default.VpnKey,
                contentDescription = null,
                tint = SwaplColors.Navy,
                modifier = Modifier.size(20.dp),
            )
            Text(
                stringResource(R.string.valuation_section_title),
                style = MaterialTheme.typography.titleLarge,
                color = SwaplColors.Navy,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.valuation_per_night, explanation.nightlyKeys),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = SwaplColors.Navy,
            )
        }

        Text(
            stringResource(R.string.valuation_intro),
            style = MaterialTheme.typography.bodySmall,
            color = SwaplColors.Navy2,
        )

        // Private-room transparency (DOK-163 C). Shown unconditionally for a room
        // so the owner understands the rate reflects only the room.
        if (explanation.isPrivateRoom) {
            RoomCoefficientNote(explanation.roomsCoefficient)
        }

        // Expand/collapse toggle for the full breakdown.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
        ) {
            Text(
                stringResource(if (expanded) R.string.valuation_hide else R.string.valuation_show),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = SwaplColors.Navy,
            )
            Icon(
                if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = null,
                tint = SwaplColors.Navy,
                modifier = Modifier.size(20.dp),
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                FactorsBreakdown(explanation)

                // Location tier in plain language.
                Text(
                    stringResource(R.string.valuation_location_note, explanation.locationTier),
                    style = MaterialTheme.typography.bodySmall,
                    color = SwaplColors.Navy2,
                )

                // AI / fallback appeal note.
                AppealNote(explanation)

                // Review feedback (bounded adjustment).
                ReviewNote(explanation)

                HorizontalDivider(color = SwaplColors.Navy.copy(alpha = 0.12f))

                // Reassurance that the value is bounded / never swings.
                Text(
                    stringResource(R.string.valuation_bounded_note, FEEDBACK_STEP_PCT, FEEDBACK_MIN_REVIEWS, FEEDBACK_BAND_PCT),
                    style = MaterialTheme.typography.bodySmall,
                    color = SwaplColors.Navy2,
                )
            }
        }
    }
}

@Composable
private fun RoomCoefficientNote(coefficient: Float) {
    val pct = (coefficient * 100).roundToInt().coerceIn(0, 100)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        modifier = Modifier
            .fillMaxWidth()
            .background(SwaplColors.Cream, RoundedCornerShape(SwaplRadius.sm))
            .padding(SwaplSpacing.s3),
    ) {
        Icon(
            Icons.Default.MeetingRoom,
            contentDescription = null,
            tint = SwaplColors.Navy,
            modifier = Modifier.size(18.dp),
        )
        Column {
            KickerLabel(stringResource(R.string.valuation_room_kicker))
            Text(
                stringResource(R.string.valuation_room_note, pct),
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy2,
            )
        }
    }
}

@Composable
private fun FactorsBreakdown(explanation: ValuationExplanation) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel(stringResource(R.string.valuation_factors_kicker))
        explanation.factors.forEach { FactorRow(it) }
        HorizontalDivider(color = SwaplColors.Navy.copy(alpha = 0.12f))
        // Pre-feedback base total.
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                stringResource(R.string.valuation_base_label),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = SwaplColors.Navy,
                modifier = Modifier.weight(1f),
            )
            Text(
                explanation.base.toString(),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = SwaplColors.Navy,
            )
        }
    }
}

@Composable
private fun FactorRow(factor: ValuationFactor) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                factorLabel(factor),
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy,
                modifier = Modifier.weight(1f),
            )
            Text(
                formatPoints(factor.points),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = SwaplColors.Navy,
            )
        }
        // Reassurance for the two factors that read badly without context: a
        // standard (+0) location tier, and the AI appeal read.
        factorNoteRes(factor)?.let { res ->
            Text(
                stringResource(res),
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy2,
            )
        }
    }
}

// String resource for a factor's explanatory note, or null when none applies.
private fun factorNoteRes(factor: ValuationFactor): Int? = when {
    factor.key == "ai_appeal" -> R.string.valuation_ai_what_note
    factor.key == "location_tier" && factor.points == 0f -> R.string.valuation_factor_location_tier_standard
    else -> null
}

@Composable
private fun AppealNote(explanation: ValuationExplanation) {
    val summary = explanation.ai.summary.trim()
    val bonus = explanation.ai.bonus
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
        KickerLabel(stringResource(R.string.valuation_ai_summary_kicker))
        // What the AI actually reads + the no-harsh-judgement / no-small-town
        // penalty reassurance.
        Text(
            stringResource(R.string.valuation_ai_what_note),
            style = MaterialTheme.typography.bodySmall,
            color = SwaplColors.Navy2,
        )
        if (explanation.ai.source == "ai" && summary.isNotEmpty()) {
            Text(
                summary,
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy2,
            )
        } else {
            Text(
                stringResource(R.string.valuation_ai_fallback_note),
                style = MaterialTheme.typography.bodySmall,
                color = SwaplColors.Navy2,
            )
        }
        // Baseline so the signed bonus is interpretable: most homes score 0,
        // capped at +AI_FEATURE_BONUS_MAX.
        val baseline = when {
            bonus > 0f -> stringResource(R.string.valuation_ai_baseline_pos, formatPoints(bonus).removePrefix("+"), AI_FEATURE_BONUS_MAX)
            bonus < 0f -> stringResource(R.string.valuation_ai_baseline_neg, formatPoints(bonus))
            else -> stringResource(R.string.valuation_ai_baseline_zero, AI_FEATURE_BONUS_MAX)
        }
        Text(
            baseline,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = SwaplColors.Navy2,
        )
    }
}

@Composable
private fun ReviewNote(explanation: ValuationExplanation) {
    val fb = explanation.feedback
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
    ) {
        Icon(
            Icons.Default.Star,
            contentDescription = null,
            tint = SwaplColors.Navy,
            modifier = Modifier.size(18.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
            KickerLabel(stringResource(R.string.valuation_review_kicker))
            val rating = fb.avgRating
            if (fb.applied && rating != null) {
                val pct = (explanation.adjustment * 100).roundToInt()
                if (pct == 0) {
                    // At/above the threshold but no net move yet: moving slowly.
                    Text(
                        stringResource(R.string.valuation_review_moving, rating, fb.reviewCount),
                        style = MaterialTheme.typography.bodySmall,
                        color = SwaplColors.Navy2,
                    )
                } else {
                    val res = if (pct > 0) R.string.valuation_review_applied_up else R.string.valuation_review_applied_down
                    Text(
                        stringResource(res, rating, fb.reviewCount, kotlin.math.abs(pct)),
                        style = MaterialTheme.typography.bodySmall,
                        color = SwaplColors.Navy2,
                    )
                }
            } else {
                // Show exactly where the host sits on the threshold.
                Text(
                    stringResource(R.string.valuation_review_pending, FEEDBACK_MIN_REVIEWS, fb.reviewCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = SwaplColors.Navy2,
                )
            }
        }
    }
}

// Human label for each factor. Falls back to the server-provided label for any
// future factor key the client doesn't know yet.
@Composable
private fun factorLabel(factor: ValuationFactor): String = when (factor.key) {
    "base" -> stringResource(R.string.valuation_factor_base)
    "size" -> stringResource(R.string.valuation_factor_size)
    "sleeps" -> stringResource(R.string.valuation_factor_sleeps)
    "location_tier" -> stringResource(R.string.valuation_factor_location_tier)
    "verified" -> stringResource(R.string.valuation_factor_verified)
    "ai_appeal" -> stringResource(R.string.valuation_factor_ai_appeal)
    else -> factor.label
}

// Render a Keys contribution: whole when integral (most factors), one decimal
// otherwise (e.g. an AI appeal bonus), always with an explicit + sign for gains.
private fun formatPoints(points: Float): String {
    val rounded = points.roundToInt()
    val text = if (kotlin.math.abs(points - rounded) < 0.05f) {
        rounded.toString()
    } else {
        String.format("%.1f", points)
    }
    return if (points > 0) "+$text" else text
}
