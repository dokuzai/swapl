package app.swapl.features.swaps

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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.R
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.ConversationParticipant
import app.swapl.core.model.ParticipantSuggestion
import app.swapl.core.model.SwapMessage
import app.swapl.core.repository.ChatRepository
import app.swapl.core.repository.ParticipantsRepository
import io.ktor.client.plugins.ClientRequestException
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

// First-class swap chat (DOK-154). Mobile-first thread: bubbles, a composer
// that's always ready (text field + one-tap send), photo attach in two taps
// (picker → existing listing-photo upload), read receipts, auto-scroll to the
// newest message, and a lightweight foreground poll. Speculare with iOS's
// SwapChatView. The thread is bound to the proposal and keeps flowing after it
// becomes an agreement.
@HiltViewModel
class SwapChatViewModel @Inject constructor(
    private val repo: ChatRepository,
    private val participantsRepo: ParticipantsRepository,
    @ApplicationContext private val appContext: Context,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val proposalId: String = checkNotNull(savedState["proposalId"])

    val messages = mutableStateListOf<SwapMessage>()

    // People panel (DOK-187). The roster is readable by everyone in the thread.
    // `canManage` flips true only for the two principals — discovered by probing
    // the principal-only suggestions endpoint (403 -> guest). Guests see who's
    // here but never the invite/remove affordances.
    val participants = mutableStateListOf<ConversationParticipant>()
    val suggestions = mutableStateListOf<ParticipantSuggestion>()
    var canManage by mutableStateOf(false); private set
    var isInviting by mutableStateOf(false); private set
    var inviteError by mutableStateOf<String?>(null); private set
    var removingId by mutableStateOf<String?>(null); private set
    var draft by mutableStateOf("")
    val pendingPhotoUrls = mutableStateListOf<String>()

    var isLoading by mutableStateOf(false); private set
    var isSending by mutableStateOf(false); private set
    var uploadsInFlight by mutableStateOf(0); private set
    var loadError by mutableStateOf<String?>(null); private set
    var sendError by mutableStateOf<String?>(null); private set
    var hasLoadedOnce by mutableStateOf(false); private set
    var hasMore by mutableStateOf(false); private set
    var isLoadingMore by mutableStateOf(false); private set
    private var nextCursor: String? = null

    // Bumps whenever the tail changes so the view can drive auto-scroll.
    var scrollAnchor by mutableStateOf<String?>(null); private set

    private var pollJob: Job? = null

    val isUploading: Boolean get() = uploadsInFlight > 0

    val canSend: Boolean
        get() = !isSending && !isUploading &&
            (draft.trim().isNotEmpty() || pendingPhotoUrls.isNotEmpty())

    // Initial / pull-to-refresh load. Marks inbound messages read.
    fun load() = viewModelScope.launch {
        isLoading = true
        loadError = null
        runCatching { repo.messages(proposalId) }
            .onSuccess { page ->
                messages.clear()
                messages.addAll(page.messages)
                nextCursor = page.nextCursor
                hasMore = page.hasMore
                scrollAnchor = messages.lastOrNull()?.id
            }
            .onFailure { loadError = it.message }
        hasLoadedOnce = true
        isLoading = false
    }

    // Roster + a one-shot probe for invite powers. The suggestions endpoint is
    // principal-only, so a 200 means "you can manage people" (and gives us the
    // co-traveler quick-picks for free); a 403 means the viewer is a guest.
    fun loadParticipants() = viewModelScope.launch {
        runCatching { participantsRepo.list(proposalId) }
            .onSuccess {
                participants.clear()
                participants.addAll(it)
            }
        runCatching { participantsRepo.suggestions(proposalId) }
            .onSuccess { list ->
                canManage = true
                suggestions.clear()
                suggestions.addAll(list)
            }
            .onFailure { canManage = false }
    }

    fun invite(intent: PeopleInvite) = viewModelScope.launch {
        isInviting = true
        inviteError = null
        runCatching {
            when (intent) {
                is PeopleInvite.ByEmail -> participantsRepo.inviteByEmail(proposalId, intent.email)
                is PeopleInvite.ByHandle -> participantsRepo.inviteByUserId(proposalId, intent.handle)
                is PeopleInvite.ByUserId -> participantsRepo.inviteByUserId(proposalId, intent.userId)
            }
        }
            .onSuccess {
                refreshParticipants()
                inviteError = null
            }
            .onFailure { inviteError = inviteMessage(it) }
        isInviting = false
    }

    fun remove(p: ConversationParticipant) = viewModelScope.launch {
        if (p.isPrincipal) return@launch
        removingId = p.id
        runCatching { participantsRepo.remove(proposalId, p.id) }
            .onSuccess { participants.remove(p) }
            .onFailure { inviteError = inviteMessage(it) }
        removingId = null
    }

    fun clearInviteError() { inviteError = null }

    private suspend fun refreshParticipants() {
        runCatching { participantsRepo.list(proposalId) }
            .onSuccess {
                participants.clear()
                participants.addAll(it)
            }
        runCatching { participantsRepo.suggestions(proposalId) }
            .onSuccess { list ->
                suggestions.clear()
                suggestions.addAll(list)
            }
    }

    private fun inviteMessage(t: Throwable): String =
        (t as? ClientRequestException)?.let {
            when (it.response.status.value) {
                403 -> appContext.getString(R.string.chat_invite_only_partners)
                404 -> appContext.getString(R.string.chat_invite_not_found)
                else -> null
            }
        } ?: t.message ?: appContext.getString(R.string.chat_invite_failed)

    // Older history: page backwards from the oldest message we hold. Peeks
    // (markRead=false) so paging history never changes receipts.
    fun loadMore() = viewModelScope.launch {
        val cursor = nextCursor
        if (!hasMore || isLoadingMore || cursor == null) return@launch
        isLoadingMore = true
        runCatching { repo.messages(proposalId, before = cursor, markRead = false) }
            .onSuccess { page ->
                val known = messages.mapTo(HashSet()) { it.id }
                val older = page.messages.filter { it.id !in known }
                messages.addAll(0, older)
                nextCursor = page.nextCursor
                hasMore = page.hasMore
            }
        // Silent on failure: the user can retry by scrolling up again.
        isLoadingMore = false
    }

    // Lightweight foreground poll: merge in anything new without disturbing the
    // composer. Marks inbound read so the badge stays current while viewing.
    fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = viewModelScope.launch {
            while (true) {
                delay(5_000)
                if (!hasLoadedOnce || isSending) continue
                runCatching { repo.messages(proposalId) }
                    .onSuccess { merge(it.messages) }
                // Transient poll failures are ignored; the next tick retries.
            }
        }
    }

    fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    fun send() = viewModelScope.launch {
        val text = draft.trim()
        val photos = pendingPhotoUrls.toList()
        if (text.isEmpty() && photos.isEmpty()) return@launch
        isSending = true
        sendError = null
        runCatching { repo.send(proposalId, text, photos) }
            .onSuccess { message ->
                // Clear the composer immediately on success — immediacy first.
                draft = ""
                pendingPhotoUrls.clear()
                merge(listOf(message))
            }
            .onFailure { sendError = it.message ?: appContext.getString(R.string.chat_send_failed) }
        isSending = false
    }

    fun addPhotos(uris: List<Uri>) {
        val room = MAX_PHOTOS - pendingPhotoUrls.size - uploadsInFlight
        uris.take(room.coerceAtLeast(0)).forEach { uri ->
            viewModelScope.launch {
                uploadsInFlight += 1
                sendError = null
                runCatching {
                    val jpeg = withContext(Dispatchers.IO) { downscaleToJpeg(uri) }
                        ?: error(appContext.getString(R.string.chat_read_image_failed))
                    repo.uploadPhoto(jpeg)
                }
                    .onSuccess { url -> if (url !in pendingPhotoUrls) pendingPhotoUrls.add(url) }
                    .onFailure { sendError = appContext.getString(R.string.chat_upload_photo_failed) }
                uploadsInFlight -= 1
            }
        }
    }

    fun removePendingPhoto(url: String) { pendingPhotoUrls.remove(url) }

    // Merge by id, preserving createdAt order, and refresh the scroll anchor
    // only when the tail actually changed (avoids fighting the user's scroll).
    private fun merge(incoming: List<SwapMessage>) {
        if (incoming.isEmpty()) return
        val byId = LinkedHashMap<String, SwapMessage>()
        messages.forEach { byId[it.id] = it }
        incoming.forEach { byId[it.id] = it }
        val merged = byId.values.sortedBy { it.createdAt }
        val changedTail = merged.lastOrNull()?.id != messages.lastOrNull()?.id
        messages.clear()
        messages.addAll(merged)
        if (changedTail) scrollAnchor = merged.lastOrNull()?.id
    }

    // Mirrors the listing uploader: longest edge ≤ 1600px, JPEG at 80%.
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

    override fun onCleared() { stopPolling() }

    private companion object {
        const val MAX_PHOTOS = 6
        const val MAX_EDGE_PX = 1600
    }
}

@Composable
fun SwapChatScreen(
    otherName: String? = null,
    onOpenTrip: () -> Unit = {},
    vm: SwapChatViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) {
        vm.load()
        vm.loadParticipants()
    }

    // Foreground-only poll: tie the loop to the screen's lifecycle so it pauses
    // in the background and resumes on return — no WebSocket, just a light GET.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> vm.startPolling()
                Lifecycle.Event.ON_PAUSE -> vm.stopPolling()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            vm.stopPolling()
        }
    }

    val listState = rememberLazyListState()
    LaunchedEffect(vm.scrollAnchor) {
        if (vm.messages.isNotEmpty()) listState.animateScrollToItem(vm.messages.lastIndex)
    }

    Column(Modifier.fillMaxSize()) {
        // Pinned trip access: the conversation is bound to a swap, so keep a tap
        // target to the full Trip screen at the very top.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onOpenTrip)
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            Text(
                text = stringResource(R.string.chat_view_trip),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
        HorizontalDivider()

        // People panel (DOK-187) — who's in this conversation, plus invite/remove
        // for principals. Guests see the roster but no controls.
        if (vm.participants.isNotEmpty()) {
            PeoplePanel(
                participants = vm.participants,
                canManage = vm.canManage,
                suggestions = vm.suggestions,
                isInviting = vm.isInviting,
                inviteError = vm.inviteError,
                removingId = vm.removingId,
                onInvite = { vm.invite(it) },
                onRemove = { vm.remove(it) },
                onDismissInviteError = { vm.clearInviteError() },
            )
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                vm.isLoading && !vm.hasLoadedOnce ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                vm.loadError != null && vm.messages.isEmpty() ->
                    ChatEmpty(
                        title = stringResource(R.string.chat_messages_unavailable),
                        body = vm.loadError ?: "",
                        actionLabel = stringResource(R.string.chat_try_again),
                        onAction = { vm.load() },
                    )
                vm.messages.isEmpty() ->
                    ChatEmpty(
                        title = stringResource(R.string.chat_say_hello_title),
                        body = stringResource(R.string.chat_say_hello_body),
                    )
                else ->
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(SwaplSpacing.s4),
                        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        if (vm.hasMore) {
                            item(key = "load-more") {
                                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    if (vm.isLoadingMore) {
                                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                                    } else {
                                        TextButton(onClick = { vm.loadMore() }) {
                                            Text(stringResource(R.string.chat_load_earlier))
                                        }
                                    }
                                }
                            }
                        }
                        items(vm.messages, key = { it.id }) { m -> MessageBubble(m) }
                    }
            }
        }

        Composer(vm)
    }
}

@Composable
private fun Composer(vm: SwapChatViewModel) {
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 6),
    ) { uris -> if (uris.isNotEmpty()) vm.addPhotos(uris) }

    Surface(tonalElevation = 2.dp) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = SwaplSpacing.s3, vertical = SwaplSpacing.s2),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            vm.sendError?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }

            if (vm.pendingPhotoUrls.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    vm.pendingPhotoUrls.forEach { url ->
                        Box {
                            SubcomposeAsyncImage(
                                model = url,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(64.dp)
                                    .clip(RoundedCornerShape(SwaplRadius.md)),
                            )
                            IconButton(
                                onClick = { vm.removePendingPhoto(url) },
                                modifier = Modifier.align(Alignment.TopEnd).size(24.dp),
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = stringResource(R.string.chat_remove_photo),
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            ) {
                IconButton(
                    onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = !vm.isUploading && vm.pendingPhotoUrls.size < 6,
                ) {
                    if (vm.isUploading) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.PhotoLibrary, contentDescription = stringResource(R.string.chat_add_photo))
                    }
                }

                OutlinedTextField(
                    value = vm.draft,
                    onValueChange = { vm.draft = it },
                    placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                    maxLines = 5,
                    shape = RoundedCornerShape(22.dp),
                    modifier = Modifier.weight(1f),
                )

                IconButton(
                    onClick = { vm.send() },
                    enabled = vm.canSend,
                ) {
                    if (vm.isSending) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.chat_send),
                            tint = if (vm.canSend) SwaplColors.Pink else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(m: SwapMessage) {
    val align = if (m.mine) Alignment.End else Alignment.Start
    val bubbleColor = if (m.mine) SwaplColors.Pink else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (m.mine) Color.White else MaterialTheme.colorScheme.onSurface

    Column(Modifier.fillMaxWidth(), horizontalAlignment = align) {
        if (m.photos.isNotEmpty()) {
            Column(
                horizontalAlignment = align,
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
            ) {
                m.photos.forEach { url ->
                    SubcomposeAsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .widthIn(max = 220.dp)
                            .height(220.dp)
                            .clip(RoundedCornerShape(SwaplRadius.md)),
                    )
                }
            }
            Spacer(Modifier.height(SwaplSpacing.s1))
        }

        if (m.body.isNotEmpty()) {
            Surface(
                color = bubbleColor,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.widthIn(max = 280.dp),
            ) {
                Text(
                    m.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = textColor,
                    modifier = Modifier.padding(horizontal = SwaplSpacing.s3, vertical = SwaplSpacing.s2),
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
            modifier = Modifier.padding(top = 2.dp),
        ) {
            Text(
                timeLabel(m.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            // Read receipt: a double-check that fills in once the other party
            // has read my message.
            if (m.mine) {
                Icon(
                    if (m.readAt != null) Icons.Default.DoneAll else Icons.Default.Done,
                    contentDescription = stringResource(if (m.readAt != null) R.string.chat_receipt_read else R.string.chat_receipt_sent),
                    tint = if (m.readAt != null) SwaplColors.Pink else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun ChatEmpty(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(SwaplSpacing.s3))
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")

private fun timeLabel(iso: String): String =
    runCatching { OffsetDateTime.parse(iso).format(timeFormatter) }.getOrDefault("")
