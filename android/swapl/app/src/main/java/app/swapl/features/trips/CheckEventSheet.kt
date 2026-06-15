package app.swapl.features.trips

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.core.repository.ListingRepository
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import app.swapl.design.components.PrimaryPill
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

// Check in / Check out bottom sheet (DOK-152): baseline photos picked from the
// photo library, downscaled and uploaded through the existing listing-photo
// pipeline (ListingRepository.uploadPhoto), plus an optional note. On submit the
// caller POSTs to /check-in or /check-out.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckEventSheet(
    isCheckIn: Boolean,
    isSubmitting: Boolean,
    listingRepo: ListingRepository,
    onDismiss: () -> Unit,
    onSubmit: (note: String, photos: List<String>) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var note by remember { mutableStateOf("") }
    val photoUrls = remember { mutableStateListOf<String>() }
    var uploadsInFlight by remember { mutableIntStateOf(0) }
    var uploadError by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 8),
    ) { uris ->
        uris.forEach { uri ->
            scope.launch {
                uploadsInFlight += 1
                uploadError = null
                try {
                    val jpeg = withContext(Dispatchers.IO) { downscaleToJpeg(context, uri) }
                    if (jpeg == null) {
                        uploadError = context.getString(R.string.dispute_photo_read_error)
                    } else {
                        val url = listingRepo.uploadPhoto(jpeg)
                        if (url !in photoUrls) photoUrls.add(url)
                    }
                } catch (t: Throwable) {
                    uploadError = context.getString(R.string.dispute_photo_upload_error)
                } finally {
                    uploadsInFlight -= 1
                }
            }
        }
    }

    val title = if (isCheckIn) stringResource(R.string.check_event_checkin) else stringResource(R.string.check_event_checkout)

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s5)
                .padding(bottom = SwaplSpacing.s8),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                if (isCheckIn)
                    stringResource(R.string.check_event_checkin_body)
                else
                    stringResource(R.string.check_event_checkout_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.check_event_baseline_photos), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                    if (uploadsInFlight > 0) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                }
                OutlinedButton(
                    onClick = {
                        picker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (photoUrls.isEmpty()) stringResource(R.string.dispute_add_photos) else stringResource(R.string.dispute_add_more_photos))
                }
                if (photoUrls.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        items(photoUrls, key = { it }) { url ->
                            Box {
                                SubcomposeAsyncImage(
                                    model = url,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(84.dp)
                                        .clip(RoundedCornerShape(SwaplRadius.sm)),
                                    loading = {},
                                    error = {},
                                )
                                IconButton(
                                    onClick = { photoUrls.remove(url) },
                                    modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                                ) {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = stringResource(R.string.cd_remove_photo),
                                        tint = MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }
                uploadError?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }

            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text(stringResource(R.string.check_event_note_label)) },
                placeholder = { Text(stringResource(R.string.check_event_note_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
            )

            PrimaryPill(
                text = if (isSubmitting) stringResource(R.string.common_saving) else title,
                onClick = { onSubmit(note, photoUrls.toList()) },
                enabled = !isSubmitting && uploadsInFlight == 0,
            )
        }
    }
}

// Mirrors the listing uploader: longest edge ≤ 1600px, JPEG at 80%.
private fun downscaleToJpeg(context: Context, uri: Uri): ByteArray? {
    val resolver = context.contentResolver
    val maxEdge = 1600
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null

    val longest = maxOf(decoded.width, decoded.height)
    val bitmap = if (longest > maxEdge) {
        val scale = maxEdge.toFloat() / longest
        Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
    } else decoded

    return ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
        out.toByteArray()
    }
}
