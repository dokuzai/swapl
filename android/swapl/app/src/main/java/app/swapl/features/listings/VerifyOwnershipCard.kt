package app.swapl.features.listings

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.repository.ListingRepository
import app.swapl.core.repository.PropertyVerificationDocument
import app.swapl.core.repository.PropertyVerificationRepository
import app.swapl.core.repository.PropertyVerificationStatus
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject

// Optional owner-proof verification (DOK-162). Strictly a trust badge — never a
// gate to publishing. The owner attaches a document (deed, utility bill, …)
// which an admin reviews; approval flips Listing.ownerVerified and earns the
// "Verified owner" badge. Shown only to the listing owner.

@HiltViewModel
class VerifyOwnershipViewModel @Inject constructor(
    private val repo: PropertyVerificationRepository,
    private val listings: ListingRepository,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    var status by mutableStateOf<PropertyVerificationStatus?>(null)
        private set
    var loaded by mutableStateOf(false)
        private set

    // Pending document uploads for the current submission.
    val pendingDocs = mutableStateListOf<PropertyVerificationDocument>()
    var uploadsInFlight by mutableStateOf(0)
        private set
    var submitting by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun load(listingId: String) {
        viewModelScope.launch {
            runCatching { repo.status(listingId) }
                .onSuccess { status = it }
                .also { loaded = true }
        }
    }

    fun addDoc(uri: Uri) {
        viewModelScope.launch {
            uploadsInFlight += 1
            error = null
            try {
                val jpeg = withContext(Dispatchers.IO) { downscaleToJpeg(uri) }
                if (jpeg == null) {
                    error = appContext.getString(R.string.owner_verify_doc_read_error)
                } else {
                    val url = listings.uploadPhoto(jpeg, filename = "ownership-doc.jpg")
                    pendingDocs.add(
                        PropertyVerificationDocument(
                            url = url,
                            label = appContext.getString(R.string.owner_verify_doc_label),
                        ),
                    )
                }
            } catch (t: Throwable) {
                error = t.message ?: appContext.getString(R.string.owner_verify_upload_failed)
            } finally {
                uploadsInFlight -= 1
            }
        }
    }

    fun removeDoc(doc: PropertyVerificationDocument) {
        pendingDocs.remove(doc)
    }

    fun submit(listingId: String, onDone: () -> Unit) {
        if (submitting || pendingDocs.isEmpty()) return
        submitting = true
        error = null
        viewModelScope.launch {
            try {
                status = repo.submit(listingId, pendingDocs.toList())
                pendingDocs.clear()
                onDone()
            } catch (t: Throwable) {
                error = t.message ?: appContext.getString(R.string.owner_verify_submit_failed)
            } finally {
                submitting = false
            }
        }
    }

    // Same downscale pipeline as the listing-photo uploader.
    private fun downscaleToJpeg(uri: Uri): ByteArray? {
        val resolver = appContext.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null

        val longest = maxOf(decoded.width, decoded.height)
        val bitmap = if (longest > MAX_EDGE_PX) {
            val scale = MAX_EDGE_PX.toFloat() / longest
            Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
        } else decoded

        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
            out.toByteArray()
        }
    }

    private companion object {
        const val MAX_EDGE_PX = 1600
    }
}

// Owner-only entry on the listing detail screen. Renders an OutlinedButton that
// reflects the current state (verified / pending / rejected / not started) and
// opens the submission dialog. Hidden once the badge is earned.
@Composable
fun VerifyOwnershipCard(
    listingId: String,
    vm: VerifyOwnershipViewModel = hiltViewModel(),
) {
    LaunchedEffect(listingId) { vm.load(listingId) }
    if (!vm.loaded) return

    val status = vm.status
    // Already verified — the badge does the talking; no entry needed.
    if (status?.ownerVerified == true) return

    var showDialog by remember { mutableStateOf(false) }
    val reviewStatus = status?.verification?.status

    OutlinedButton(
        onClick = { showDialog = true },
        shape = androidx.compose.foundation.shape.CircleShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(Icons.Default.WorkspacePremium, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(SwaplSpacing.s2))
        Text(
            when (reviewStatus) {
                "pending" -> stringResource(R.string.owner_verify_cta_pending)
                "rejected" -> stringResource(R.string.owner_verify_cta_rejected)
                else -> stringResource(R.string.owner_verify_cta)
            },
        )
    }
    Text(
        stringResource(R.string.owner_verify_optional_note),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    if (showDialog) {
        VerifyOwnershipDialog(
            listingId = listingId,
            reviewStatus = reviewStatus,
            vm = vm,
            onDismiss = { showDialog = false },
        )
    }
}

@Composable
private fun VerifyOwnershipDialog(
    listingId: String,
    reviewStatus: String?,
    vm: VerifyOwnershipViewModel,
    onDismiss: () -> Unit,
) {
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) vm.addDoc(uri) }

    AlertDialog(
        onDismissRequest = { if (!vm.submitting) onDismiss() },
        title = { Text(stringResource(R.string.owner_verify_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Text(
                    stringResource(R.string.owner_verify_explainer),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    stringResource(R.string.owner_verify_optional_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                when (reviewStatus) {
                    "pending" -> StatusLine(stringResource(R.string.owner_verify_status_pending))
                    "rejected" -> StatusLine(stringResource(R.string.owner_verify_status_rejected))
                    else -> {}
                }

                OutlinedButton(
                    onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = !vm.submitting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(SwaplSpacing.s2))
                    Text(stringResource(R.string.owner_verify_add_document))
                }

                if (vm.uploadsInFlight > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(stringResource(R.string.owner_verify_uploading), style = MaterialTheme.typography.bodySmall)
                    }
                }

                vm.pendingDocs.forEach { doc ->
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.removeDoc(doc) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(doc.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text(stringResource(R.string.owner_verify_remove), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }

                vm.error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            PrimaryPill(
                text = if (vm.submitting) stringResource(R.string.owner_verify_submitting) else stringResource(R.string.owner_verify_submit),
                onClick = { vm.submit(listingId, onDone = onDismiss) },
                enabled = !vm.submitting && vm.pendingDocs.isNotEmpty() && vm.uploadsInFlight == 0,
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !vm.submitting) {
                Text(stringResource(R.string.owner_verify_cancel))
            }
        },
    )
}

@Composable
private fun StatusLine(text: String) {
    Spacer(Modifier.height(4.dp))
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
}
