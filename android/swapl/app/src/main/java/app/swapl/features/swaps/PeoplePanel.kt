package app.swapl.features.swaps

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.core.model.ConversationParticipant
import app.swapl.core.model.ParticipantSuggestion
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage

// People panel (DOK-187). A calm strip at the top of the swap thread: the
// avatars of everyone in the conversation — the two principals plus any guests
// — with a "pending" badge while an invite is in flight. Principals also get an
// "Invite" affordance and the ability to remove a guest; guests only see who's
// here. The copy keeps it reassuring: bringing someone in is easy and never
// hands them any control over the swap.
@Composable
fun PeoplePanel(
    participants: List<ConversationParticipant>,
    canManage: Boolean,
    suggestions: List<ParticipantSuggestion>,
    isInviting: Boolean,
    inviteError: String?,
    removingId: String?,
    onInvite: (PeopleInvite) -> Unit,
    onRemove: (ConversationParticipant) -> Unit,
    onDismissInviteError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    var showInvite by remember { mutableStateOf(false) }

    val pendingCount = participants.count { it.isPending }

    Surface(tonalElevation = 1.dp, modifier = modifier.fillMaxWidth()) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
            ) {
                Text(
                    stringResource(R.string.people_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium,
                )
                if (pendingCount > 0) {
                    Spacer(Modifier.size(SwaplSpacing.s2))
                    PendingPill()
                }
                Spacer(Modifier.weight(1f))
                Icon(
                    if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Always-visible avatar row — a glance of who's in the conversation.
            Row(
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                participants.take(6).forEach { p -> Avatar(p, size = 36.dp) }
                if (participants.size > 6) {
                    Text(
                        "+${participants.size - 6}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (canManage) {
                    Box(
                        Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(SwaplColors.PinkLight)
                            .clickable { showInvite = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.PersonAdd,
                            contentDescription = stringResource(R.string.people_invite),
                            tint = SwaplColors.Pink,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }

            AnimatedVisibility(expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                    Spacer(Modifier.height(SwaplSpacing.s1))
                    participants.forEach { p ->
                        ParticipantRow(
                            p = p,
                            canRemove = canManage && !p.isPrincipal,
                            isRemoving = removingId == p.id,
                            onRemove = { onRemove(p) },
                        )
                    }
                    if (canManage) {
                        Spacer(Modifier.height(SwaplSpacing.s1))
                        TextButton(onClick = { showInvite = true }) {
                            Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.size(SwaplSpacing.s1))
                            Text(stringResource(R.string.people_invite))
                        }
                    }
                }
            }
        }
    }

    if (showInvite) {
        InviteDialog(
            suggestions = suggestions,
            isInviting = isInviting,
            error = inviteError,
            onDismiss = {
                showInvite = false
                onDismissInviteError()
            },
            onInvite = onInvite,
        )
    }
}

// Carries one invite intent up to the view model — by handle/email typed in the
// field, or by tapping a co-traveler suggestion.
sealed interface PeopleInvite {
    data class ByEmail(val email: String) : PeopleInvite
    data class ByHandle(val handle: String) : PeopleInvite
    data class ByUserId(val userId: String) : PeopleInvite
}

@Composable
private fun ParticipantRow(
    p: ConversationParticipant,
    canRemove: Boolean,
    isRemoving: Boolean,
    onRemove: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        modifier = Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s1),
    ) {
        Avatar(p, size = 32.dp)
        Column(Modifier.weight(1f)) {
            Text(
                p.displayName,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = when {
                p.isPrincipal -> stringResource(R.string.people_role_principal)
                p.isPending -> stringResource(R.string.people_status_pending)
                else -> stringResource(R.string.people_role_guest)
            }
            Text(
                sub,
                style = MaterialTheme.typography.labelSmall,
                color = if (p.isPending) SwaplColors.Pink else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (canRemove) {
            if (isRemoving) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.people_remove, p.displayName),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun PendingPill() {
    Text(
        stringResource(R.string.people_status_pending),
        style = MaterialTheme.typography.labelSmall,
        color = SwaplColors.Pink,
        modifier = Modifier
            .background(SwaplColors.PinkLight, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun Avatar(p: ConversationParticipant, size: androidx.compose.ui.unit.Dp) {
    val initial = p.displayName.trim().firstOrNull()?.uppercase() ?: "?"
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (p.isPending) MaterialTheme.colorScheme.surfaceVariant else SwaplColors.Navy3),
        contentAlignment = Alignment.Center,
    ) {
        val avatar = p.avatar
        if (!avatar.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = avatar,
                contentDescription = p.displayName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        } else {
            Text(
                initial,
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun InviteDialog(
    suggestions: List<ParticipantSuggestion>,
    isInviting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onInvite: (PeopleInvite) -> Unit,
) {
    var input by remember { mutableStateOf("") }
    val trimmed = input.trim()
    val looksLikeEmail = trimmed.contains("@") && trimmed.contains(".")
    val handle = trimmed.removePrefix("@")
    val canSubmit = !isInviting && (looksLikeEmail || handle.isNotBlank())

    AlertDialog(
        onDismissRequest = { if (!isInviting) onDismiss() },
        title = { Text(stringResource(R.string.people_invite_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Text(
                    stringResource(R.string.people_invite_reassure),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text(stringResource(R.string.people_invite_field_label)) },
                    placeholder = { Text(stringResource(R.string.people_invite_field_placeholder)) },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (suggestions.isNotEmpty()) {
                    Text(
                        stringResource(R.string.people_add_cotravelers),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium,
                    )
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                        modifier = Modifier.heightIn(max = 180.dp),
                    ) {
                        items(suggestions, key = { it.userId }) { s ->
                            SuggestionRow(
                                s = s,
                                enabled = !isInviting,
                                onPick = { onInvite(PeopleInvite.ByUserId(s.userId)) },
                            )
                        }
                    }
                }

                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSubmit,
                onClick = {
                    onInvite(
                        if (looksLikeEmail) PeopleInvite.ByEmail(trimmed)
                        else PeopleInvite.ByHandle(handle),
                    )
                },
            ) {
                if (isInviting) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.people_invite_send))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isInviting) {
                Text(stringResource(R.string.people_invite_cancel))
            }
        },
    )
}

@Composable
private fun SuggestionRow(
    s: ParticipantSuggestion,
    enabled: Boolean,
    onPick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(SwaplColors.Navy3),
            contentAlignment = Alignment.Center,
        ) {
            if (!s.avatar.isNullOrBlank()) {
                SubcomposeAsyncImage(
                    model = s.avatar,
                    contentDescription = s.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(32.dp).clip(CircleShape),
                )
            } else {
                Text(
                    s.displayName.trim().firstOrNull()?.uppercase() ?: "?",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                )
            }
        }
        Text(
            s.displayName,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        AssistChip(
            onClick = { if (enabled) onPick() },
            enabled = enabled,
            label = { Text(stringResource(R.string.people_add)) },
            colors = AssistChipDefaults.assistChipColors(labelColor = SwaplColors.Pink),
        )
    }
}
