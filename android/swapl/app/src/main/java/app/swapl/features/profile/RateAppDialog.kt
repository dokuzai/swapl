package app.swapl.features.profile

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.repository.AppFeedbackRepository
import app.swapl.design.components.KickerLabel
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import com.google.android.play.core.review.ReviewManagerFactory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

@HiltViewModel
class RateAppViewModel @Inject constructor(
    private val repo: AppFeedbackRepository,
) : ViewModel() {
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    // Post structured feedback, then route by score:
    //   >= 4 -> ask the Play In-App Review API to surface the native rating card
    //   <= 2 -> hand the caller a support deep-link instead of the store
    // The review request never blocks the feedback submission and fails silently
    // when Play is absent. `surface`/`contextKey` let the same sheet serve the
    // Account row ("account") and the contextual triggers ("post-review",
    // "post-swap" keyed by agreementId) — the backend upserts on the unique
    // (userId, surface, contextKey).
    fun submit(
        score: Int,
        comment: String?,
        surface: String,
        contextKey: String,
        activity: Activity?,
        onSupport: () -> Unit,
        onDone: () -> Unit,
    ) = viewModelScope.launch {
        isSubmitting = true
        error = null
        runCatching { repo.submit(score, comment, surface = surface, contextKey = contextKey) }
            .onSuccess {
                if (score >= 4 && activity != null) {
                    runCatching {
                        val manager = ReviewManagerFactory.create(activity)
                        val info = manager.requestReviewFlow().await()
                        manager.launchReviewFlow(activity, info).await()
                    }
                } else if (score <= 2) {
                    onSupport()
                }
                onDone()
            }
            .onFailure { error = it.message }
        isSubmitting = false
    }
}

// Rate-the-app sheet (M1 / DOK-190): 1-5 stars + optional comment, POSTed to
// /api/app-feedback (source "android"). Reusable across surfaces:
//   - "account": the Account "Rate the app" row (contextKey "")
//   - "post-review": after a traveller review (contextKey = agreementId)
//   - "post-swap": when a swap reaches COMPLETED (contextKey = agreementId)
// High scores (>=4) trigger the Play In-App Review card; low scores (<=2) open
// the support help link instead of the store.
@Composable
fun RateAppDialog(
    onDismiss: () -> Unit,
    surface: String = "account",
    contextKey: String = "",
    helpUrl: String? = null,
    vm: RateAppViewModel = hiltViewModel(),
) {
    var rating by remember { mutableIntStateOf(0) }
    var comment by remember { mutableStateOf("") }
    val activity = LocalContext.current as? Activity
    val uriHandler = LocalUriHandler.current

    AlertDialog(
        onDismissRequest = { if (!vm.isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.rate_app_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                val promptRes = when (surface) {
                    "post-review" -> R.string.rate_app_prompt_post_review
                    "post-swap" -> R.string.rate_app_prompt_post_swap
                    else -> R.string.rate_app_prompt
                }
                Text(
                    stringResource(promptRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (rating in 1..2) {
                    Text(
                        stringResource(R.string.rate_app_low_support_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                KickerLabel(stringResource(R.string.rate_app_score_label))
                val ratingCd = stringResource(R.string.cd_rating_out_of_5, rating)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                    modifier = Modifier.semantics {
                        contentDescription = ratingCd
                    },
                ) {
                    (1..5).forEach { n ->
                        Icon(
                            if (n <= rating) Icons.Default.Star else Icons.Default.StarBorder,
                            contentDescription = null,
                            tint = if (n <= rating) SwaplColors.Pink else SwaplColors.Cream2,
                            modifier = Modifier
                                .size(36.dp)
                                .clickable(enabled = !vm.isSubmitting) { rating = n },
                        )
                    }
                }
                KickerLabel(stringResource(R.string.rate_app_comment_label))
                OutlinedTextField(
                    comment,
                    { comment = it },
                    placeholder = { Text(stringResource(R.string.rate_app_comment_placeholder)) },
                    enabled = !vm.isSubmitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 96.dp),
                )
                vm.error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = rating in 1..5 && !vm.isSubmitting,
                onClick = {
                    vm.submit(
                        score = rating,
                        comment = comment.trim().ifBlank { null },
                        surface = surface,
                        contextKey = contextKey,
                        activity = activity,
                        onSupport = {
                            helpUrl?.takeIf { it.isNotBlank() }?.let {
                                runCatching { uriHandler.openUri(it) }
                            }
                        },
                        onDone = { onDismiss() },
                    )
                },
            ) {
                Text(
                    when {
                        vm.isSubmitting -> stringResource(R.string.rate_app_submitting)
                        rating in 1..2 && helpUrl != null -> stringResource(R.string.rate_app_submit_support)
                        else -> stringResource(R.string.rate_app_submit)
                    },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !vm.isSubmitting) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}
