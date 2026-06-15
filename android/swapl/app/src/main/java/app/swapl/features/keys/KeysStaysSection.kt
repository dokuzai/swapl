package app.swapl.features.keys

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.KeysStay
import app.swapl.core.repository.KeysRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

// Keys stays inside Trips (DOK-155). A Stay-with-Keys is one-directional, so it
// doesn't fit the reciprocal "trip" card — it gets its own section. The guest
// sees status + a cancel for pending stays; the host sees confirm/decline so
// they can accept the stay (which releases the hold into a real spend/earn and
// issues a cover policy server-side).

@HiltViewModel
class KeysStaysViewModel @Inject constructor(private val repo: KeysRepository) : ViewModel() {
    var stays by mutableStateOf<List<KeysStay>?>(null); private set
    var busyStayId by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        runCatching { stays = repo.stays().stays }
    }

    fun confirm(id: String) = act(id) { repo.confirmStay(id) }
    fun decline(id: String) = act(id) { repo.declineStay(id) }
    fun cancel(id: String) = act(id) { repo.cancelStay(id) }

    private fun act(id: String, op: suspend () -> Unit) = viewModelScope.launch {
        busyStayId = id
        try {
            op()
            runCatching { stays = repo.stays().stays }
        } finally {
            busyStayId = null
        }
    }
}

// Embedded in TripsScreen. Renders nothing when the member has no Keys stays,
// so it stays out of the way for swap-only users.
@Composable
fun KeysStaysSection(vm: KeysStaysViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val stays = vm.stays ?: return
    if (stays.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Stays with points")
        stays.forEach { stay ->
            KeysStayCard(
                stay = stay,
                isBusy = vm.busyStayId == stay.id,
                onConfirm = { vm.confirm(stay.id) },
                onDecline = { vm.decline(stay.id) },
                onCancel = { vm.cancel(stay.id) },
            )
        }
    }
}

@Composable
private fun KeysStayCard(
    stay: KeysStay,
    isBusy: Boolean,
    onConfirm: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
) {
    SurfaceCard(modifier = Modifier.alpha(if (isBusy) 0.5f else 1f)) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        if (stay.isGuest) "Stay in ${stay.listing.city}" else "Guest at ${stay.listing.title}",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        "${stay.dateFrom.take(10)} → ${stay.dateTo.take(10)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "${stay.nights} night${if (stay.nights == 1) "" else "s"} · ${stay.keysCost} points",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(stay)
            }

            when {
                // Host actions for a pending stay: confirm or decline.
                stay.isPending && !stay.isGuest -> Row(
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    OutlinedButton(onClick = onDecline, enabled = !isBusy, modifier = Modifier.weight(1f)) {
                        Text("Decline")
                    }
                    Button(onClick = onConfirm, enabled = !isBusy, modifier = Modifier.weight(1f)) {
                        Text("Confirm stay")
                    }
                }
                // Guest can cancel while it's still pending.
                stay.isPending && stay.isGuest -> OutlinedButton(
                    onClick = onCancel,
                    enabled = !isBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Cancel request") }
                // Confirmed guest sees reassurance about the cover policy.
                stay.status == "confirmed" -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    Icon(
                        Icons.Default.Shield,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 2.dp),
                    )
                    Text(
                        "Confirmed — your stay is covered by a Swapl policy.",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(stay: KeysStay) {
    val label = when (stay.status) {
        "pending" -> if (stay.isGuest) "Awaiting host" else "Action needed"
        "confirmed" -> "Confirmed"
        "declined" -> "Declined"
        "cancelled" -> "Cancelled"
        "completed" -> "Completed"
        else -> stay.status.replaceFirstChar { it.uppercase() }
    }
    val color = when (stay.status) {
        "confirmed", "completed" -> MaterialTheme.colorScheme.primary
        "declined", "cancelled" -> MaterialTheme.colorScheme.error
        else -> SwaplColors.Navy
    }
    Text(
        label.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
