package app.swapl.features.trips

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import app.swapl.core.model.Dispute
import app.swapl.core.model.DisputeCategory
import app.swapl.core.model.DisputeMessage
import app.swapl.core.model.DisputeStatus
import app.swapl.core.model.SupportContacts
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

// Dispute / resolution-center flow in the trip cockpit (DOK-153).
//
// "Report a problem" opens this native flow instead of bouncing to the web help
// page. It has two faces, driven by what the server returns for the agreement:
//   - no open case  -> the OPEN bottom sheet (category + description + photos).
//   - an open case   -> the CASE card: status, the original report, the message
//                        timeline, and a reply composer. Urgent cases (safety /
//                        access) foreground the 24/7 line.
//
// Mobile-first, few taps: the form is one scroll, photos reuse the shared
// listing-photo upload pipeline, and the case auto-refreshes after a reply.

// MARK: - State holder ----------------------------------------------------

// What DisputeSection needs from the host ViewModel. Keeping it an interface
// lets the composable stay free of Hilt/VM types while the VM owns the loading,
// the disputes list, and the open/reply calls (all server-gated).
interface DisputeFlowState {
    val disputes: List<Dispute>
    val isLoading: Boolean
    val isSubmitting: Boolean
    val baseUrl: String
    // Server-configured support contacts (24/7 line + help URL); starts at the
    // launch defaults and is overlaid once the config endpoint resolves.
    val supportContacts: SupportContacts

    // The newest non-terminal case is the live card; if every case is
    // resolved/closed we fall back to the newest so members can still read
    // history, while the entry point can open a fresh one.
    val activeDispute: Dispute?
        get() = disputes.firstOrNull { !it.statusKind.isTerminal } ?: disputes.firstOrNull()
    val hasOpenCase: Boolean
        get() = disputes.any { !it.statusKind.isTerminal }

    fun open(category: DisputeCategory, description: String, photos: List<String>, onDone: () -> Unit)
    fun reply(disputeId: String, body: String, photos: List<String>)
}

// MARK: - Entry rendered inside the cockpit -------------------------------

@Composable
fun DisputeSection(
    state: DisputeFlowState,
    otherName: String?,
    myUserId: String?,
    listingRepo: ListingRepository,
) {
    val context = LocalContext.current
    var showOpenSheet by remember { mutableStateOf(false) }
    // Set when both the Custom Tab and the plain-browser fallback fail to launch
    // the help URL; drives the last-resort dialog that offers a direct dial.
    var phoneFallback by remember { mutableStateOf<String?>(null) }

    val onCallLine = { open24x7(context, state.supportContacts) { phone -> phoneFallback = phone } }

    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        val dispute = state.activeDispute
        when {
            state.isLoading && state.disputes.isEmpty() ->
                Box(Modifier.fillMaxWidth().padding(SwaplSpacing.s5), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                }
            dispute != null -> {
                DisputeCaseCard(
                    dispute = dispute,
                    myUserId = myUserId,
                    isSubmitting = state.isSubmitting,
                    listingRepo = listingRepo,
                    onCallLine = onCallLine,
                    onReply = { body, photos -> state.reply(dispute.id, body, photos) },
                )
                // A resolved/closed history still lets you raise a fresh issue.
                if (!state.hasOpenCase) {
                    ReportProblemButton("Report a new problem") { showOpenSheet = true }
                }
            }
            else -> ReportProblemButton("Report a problem") { showOpenSheet = true }
        }
    }

    if (showOpenSheet) {
        DisputeOpenSheet(
            otherName = otherName,
            isSubmitting = state.isSubmitting,
            listingRepo = listingRepo,
            onCallLine = onCallLine,
            onDismiss = { showOpenSheet = false },
            onSubmit = { category, description, photos ->
                state.open(category, description, photos) { showOpenSheet = false }
            },
        )
    }

    phoneFallback?.let { phone ->
        PhoneFallbackDialog(
            phone = phone,
            onCall = {
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_DIAL, "tel:${phone.dialableDigits()}".toUri()))
                }
                phoneFallback = null
            },
            onDismiss = { phoneFallback = null },
        )
    }
}

@Composable
private fun PhoneFallbackDialog(phone: String, onCall: () -> Unit, onDismiss: () -> Unit) {
    val canDial = phone.dialableDigits().any { it.isDigit() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reach our 24/7 line") },
        text = { Text("If anyone is unsafe or locked out, call $phone.") },
        confirmButton = {
            if (canDial) {
                TextButton(onClick = onCall) { Text("Call $phone") }
            } else {
                TextButton(onClick = onDismiss) { Text("OK") }
            }
        },
        dismissButton = if (canDial) {
            { TextButton(onClick = onDismiss) { Text("Cancel") } }
        } else null,
    )
}

// Keeps only digits and a leading-plus's digits so the string is safe inside a
// tel: URI. Returns "" when there's nothing dialable (e.g. the launch default
// "+44 800 000 swap").
private fun String.dialableDigits(): String = filter { it.isDigit() || it == '+' }

@Composable
private fun ReportProblemButton(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick) {
        Icon(Icons.Outlined.ReportProblem, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(SwaplSpacing.s2))
        Text(text)
    }
}

// The 24/7 line. We have no in-app phone number, so foregrounding it means
// routing to the always-on help page (same target the cockpit used before),
// surfaced more prominently from urgent cases.
//
// Robust fallback chain (DOK-153): launching a Custom Tab throws if no browser
// supports them (or the device has no browser at all), which would otherwise
// leave an urgent member stuck. So we try the Custom Tab, fall back to a plain
// ACTION_VIEW, and if even that has no handler we surface a dialog with the
// phone number to dial directly.
private fun open24x7(context: Context, contacts: SupportContacts, onNoBrowser: (phone: String) -> Unit) {
    val url = contacts.helpUrl.toUri()
    try {
        CustomTabsIntent.Builder().build().launchUrl(context, url)
        return
    } catch (_: Throwable) {
        // No Custom Tabs provider — fall through to a plain browser intent.
    }
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, url))
        return
    } catch (_: Throwable) {
        // No activity can open a web URL — last resort is the phone dialog.
    }
    onNoBrowser(contacts.phone)
}

// MARK: - Urgent 24/7 banner ----------------------------------------------

@Composable
fun DisputeUrgentBanner(onCallLine: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SwaplRadius.md))
            .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f))
            .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.25f), RoundedCornerShape(SwaplRadius.md))
            .clickable(onClick = onCallLine)
            .padding(SwaplSpacing.s4),
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Outlined.Phone,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(20.dp),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Need help right now?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Text(
                "If anyone is unsafe or locked out, our 24/7 line is here. Tap to reach support now.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
    }
}

// MARK: - Open-a-dispute bottom sheet -------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DisputeOpenSheet(
    otherName: String?,
    isSubmitting: Boolean,
    listingRepo: ListingRepository,
    onCallLine: () -> Unit,
    onDismiss: () -> Unit,
    onSubmit: (category: DisputeCategory, description: String, photos: List<String>) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf<DisputeCategory?>(null) }
    var description by remember { mutableStateOf("") }
    val photoUrls = remember { mutableStateListOf<String>() }
    var uploadsInFlight by remember { mutableIntStateOf(0) }
    var uploadError by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 12),
    ) { uris ->
        uris.forEach { uri ->
            scope.launch {
                uploadsInFlight += 1
                uploadError = null
                try {
                    val jpeg = withContext(Dispatchers.IO) { downscaleDisputePhoto(context, uri) }
                    if (jpeg == null) uploadError = "Couldn't read that image"
                    else {
                        val url = listingRepo.uploadPhoto(jpeg)
                        if (url !in photoUrls) photoUrls.add(url)
                    }
                } catch (t: Throwable) {
                    uploadError = "Couldn't upload a photo. Check your connection and try again."
                } finally {
                    uploadsInFlight -= 1
                }
            }
        }
    }

    val trimmed = description.trim()
    val valid = category != null && trimmed.isNotEmpty() && trimmed.length <= 4000

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s5)
                .padding(bottom = SwaplSpacing.s8),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
        ) {
            Text("Report a problem", style = MaterialTheme.typography.titleLarge)
            Text(
                "Tell us what's going on with your swap${otherName?.let { " with $it" } ?: ""}. " +
                    "We'll loop in your swap partner and our support team.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Category picker
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Text(
                    "WHAT HAPPENED?",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DisputeCategory.entries.forEach { item ->
                    val selected = category == item
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(SwaplRadius.md))
                            .border(
                                if (selected) 1.5.dp else 1.dp,
                                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                                RoundedCornerShape(SwaplRadius.md),
                            )
                            .clickable { category = item }
                            .padding(SwaplSpacing.s4),
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                item.title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Medium,
                                color = if (item.isUrgent) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                item.subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Icon(
                            if (selected) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                            contentDescription = null,
                            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }

            if (category?.isUrgent == true) {
                DisputeUrgentBanner(onCallLine = onCallLine)
            }

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Describe the problem") },
                placeholder = { Text("What happened, when, and what you need from us.") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
                maxLines = 8,
            )

            DisputePhotoField(
                photoUrls = photoUrls,
                uploadsInFlight = uploadsInFlight,
                uploadError = uploadError,
                onAdd = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onRemove = { photoUrls.remove(it) },
            )

            PrimaryPill(
                text = if (isSubmitting) "Sending…" else "Send report",
                onClick = { category?.let { onSubmit(it, trimmed, photoUrls.toList()) } },
                enabled = valid && !isSubmitting && uploadsInFlight == 0,
            )
        }
    }
}

// MARK: - Live case card --------------------------------------------------

@Composable
fun DisputeCaseCard(
    dispute: Dispute,
    myUserId: String?,
    isSubmitting: Boolean,
    listingRepo: ListingRepository,
    onCallLine: () -> Unit,
    onReply: (body: String, photos: List<String>) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var replyText by remember { mutableStateOf("") }
    val photoUrls = remember { mutableStateListOf<String>() }
    var uploadsInFlight by remember { mutableIntStateOf(0) }
    var uploadError by remember { mutableStateOf<String?>(null) }

    val status = dispute.statusKind

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 12),
    ) { uris ->
        uris.forEach { uri ->
            scope.launch {
                uploadsInFlight += 1
                uploadError = null
                try {
                    val jpeg = withContext(Dispatchers.IO) { downscaleDisputePhoto(context, uri) }
                    if (jpeg == null) uploadError = "Couldn't read that image"
                    else {
                        val url = listingRepo.uploadPhoto(jpeg)
                        if (url !in photoUrls) photoUrls.add(url)
                    }
                } catch (t: Throwable) {
                    uploadError = "Couldn't upload a photo. Check your connection and try again."
                } finally {
                    uploadsInFlight -= 1
                }
            }
        }
    }

    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
            // Header: category + reported date + status pill
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(dispute.categoryKind.title, style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Reported ${dispute.createdAt.take(10)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusPill(status)
            }

            if (dispute.urgent && !status.isTerminal) {
                DisputeUrgentBanner(onCallLine = onCallLine)
            }

            // Original report
            Text(dispute.description, style = MaterialTheme.typography.bodyMedium)
            if (dispute.photos.isNotEmpty()) DisputeThumbnailStrip(dispute.photos)

            // Resolution note
            dispute.resolution?.takeIf { it.isNotBlank() }?.let { resolution ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(SwaplRadius.md))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(SwaplSpacing.s4),
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "RESOLUTION",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(resolution, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            // Timeline
            if (dispute.messages.isNotEmpty()) {
                HorizontalDivider()
                Text(
                    "CONVERSATION",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    dispute.messages.forEach { message ->
                        DisputeMessageRow(message, mine = myUserId != null && message.authorId == myUserId)
                    }
                }
            }

            // Composer or terminal footer
            if (status.isTerminal) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        if (status == DisputeStatus.RESOLVED) "This case has been resolved." else "This case is closed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                HorizontalDivider()
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    Text(
                        "REPLY",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = replyText,
                        onValueChange = { replyText = it },
                        placeholder = { Text("Add a reply…") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 6,
                    )
                    DisputePhotoField(
                        photoUrls = photoUrls,
                        uploadsInFlight = uploadsInFlight,
                        uploadError = uploadError,
                        onAdd = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        onRemove = { photoUrls.remove(it) },
                    )
                    val canSend = replyText.trim().isNotEmpty() && !isSubmitting && uploadsInFlight == 0
                    PrimaryPill(
                        text = if (isSubmitting) "Sending…" else "Send",
                        onClick = {
                            onReply(replyText.trim(), photoUrls.toList())
                            replyText = ""
                            photoUrls.clear()
                        },
                        enabled = canSend,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusPill(status: DisputeStatus) {
    Text(
        status.label,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        color = if (status.isTerminal) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
            .padding(horizontal = SwaplSpacing.s3, vertical = SwaplSpacing.s1),
    )
}

@Composable
private fun DisputeMessageRow(message: DisputeMessage, mine: Boolean) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Text(
                if (mine) "You" else (message.authorName ?: "Support"),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                message.createdAt.take(10),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SwaplRadius.md))
                .background(if (mine) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(SwaplRadius.md))
                .padding(SwaplSpacing.s3),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            if (message.body.isNotEmpty()) {
                Text(message.body, style = MaterialTheme.typography.bodyMedium)
            }
            if (message.photos.isNotEmpty()) DisputeThumbnailStrip(message.photos)
        }
    }
}

// MARK: - Shared photo widgets --------------------------------------------

@Composable
private fun DisputePhotoField(
    photoUrls: List<String>,
    uploadsInFlight: Int,
    uploadError: String?,
    onAdd: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "PHOTOS (OPTIONAL)",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (uploadsInFlight > 0) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        }
        OutlinedButton(onClick = onAdd, modifier = Modifier.fillMaxWidth()) {
            Text(if (photoUrls.isEmpty()) "Add photos" else "Add more")
        }
        if (photoUrls.isNotEmpty()) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                items(photoUrls, key = { it }) { url ->
                    Box {
                        SubcomposeAsyncImage(
                            model = url,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(84.dp).clip(RoundedCornerShape(SwaplRadius.sm)),
                            loading = {},
                            error = {},
                        )
                        IconButton(
                            onClick = { onRemove(url) },
                            modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "Remove photo", tint = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }
        uploadError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun DisputeThumbnailStrip(urls: List<String>) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        items(urls, key = { it }) { url ->
            SubcomposeAsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(64.dp).clip(RoundedCornerShape(SwaplRadius.sm)),
                loading = {},
                error = {},
            )
        }
    }
}

// Mirrors the listing uploader: longest edge ≤ 1600px, JPEG at 80%.
private fun downscaleDisputePhoto(context: Context, uri: Uri): ByteArray? {
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
