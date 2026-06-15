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

    // Post structured feedback, then (for high scores) ask the Play In-App
    // Review API to surface the native rating card. The review request never
    // blocks the feedback submission and fails silently when Play is absent.
    fun submit(score: Int, comment: String?, activity: Activity?, onDone: () -> Unit) =
        viewModelScope.launch {
            isSubmitting = true
            error = null
            runCatching { repo.submit(score, comment, surface = "account", contextKey = "") }
                .onSuccess {
                    if (score >= 4 && activity != null) {
                        runCatching {
                            val manager = ReviewManagerFactory.create(activity)
                            val info = manager.requestReviewFlow().await()
                            manager.launchReviewFlow(activity, info).await()
                        }
                    }
                    onDone()
                }
                .onFailure { error = it.message }
            isSubmitting = false
        }
}

// Rate-the-app sheet (M1): 1-5 stars + optional comment, POSTed to
// /api/app-feedback (source "android", surface "account"). High scores also
// trigger the Play In-App Review card.
@Composable
fun RateAppDialog(
    onDismiss: () -> Unit,
    vm: RateAppViewModel = hiltViewModel(),
) {
    var rating by remember { mutableIntStateOf(0) }
    var comment by remember { mutableStateOf("") }
    val activity = LocalContext.current as? Activity

    AlertDialog(
        onDismissRequest = { if (!vm.isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.rate_app_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Text(
                    stringResource(R.string.rate_app_prompt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                KickerLabel(stringResource(R.string.rate_app_score_label))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                    modifier = Modifier.semantics {
                        contentDescription = "$rating / 5"
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
                    vm.submit(rating, comment.trim().ifBlank { null }, activity) { onDismiss() }
                },
            ) {
                Text(
                    if (vm.isSubmitting) stringResource(R.string.rate_app_submitting)
                    else stringResource(R.string.rate_app_submit),
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
