package app.swapl.features.keys

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.content.Context
import app.swapl.R
import app.swapl.core.model.KeysAvailability
import app.swapl.core.repository.KeysRepository
import app.swapl.design.components.AvailabilityCalendar
import app.swapl.design.components.CalendarUnavailable
import app.swapl.design.components.parseCalendarDate
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.client.plugins.ClientRequestException
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject

// Stay-with-Keys request (DOK-155). A one-directional stay: the guest pays in
// points, the host need not travel. Sits ALONGSIDE the direct-swap proposal
// flow, never replacing it. Immediacy is the point — pick dates, see the cost,
// tap "Request with points". Insufficient balance shows a message, never an
// offer to buy.

@HiltViewModel
class StayWithKeysViewModel @Inject constructor(
    private val repo: KeysRepository,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {
    var availability by mutableStateOf<KeysAvailability?>(null); private set
    var balance by mutableStateOf<Int?>(null); private set
    var loadError by mutableStateOf<String?>(null); private set

    var isSubmitting by mutableStateOf(false); private set
    var requestError by mutableStateOf<String?>(null); private set
    var requestedStayId by mutableStateOf<String?>(null); private set

    fun load(listingId: String) = viewModelScope.launch {
        loadError = null
        runCatching {
            // Availability gives the nightly rate + window; the wallet balance
            // powers the "enough points?" hint.
            availability = repo.availability(listingId)
            balance = repo.wallet().balance
        }.onFailure { loadError = it.message }
    }

    fun submit(listingId: String, from: String, to: String) {
        if (isSubmitting) return
        viewModelScope.launch {
            isSubmitting = true; requestError = null
            try {
                requestedStayId = repo.requestStay(listingId, from, to).stayId
            } catch (t: ClientRequestException) {
                requestError = when (t.response.status.value) {
                    // Insufficient points — never an offer to buy; just inform.
                    422 -> appContext.getString(R.string.stay_keys_error_insufficient)
                    else -> appContext.getString(R.string.stay_keys_error_unavailable)
                }
            } catch (t: Throwable) {
                requestError = t.message ?: appContext.getString(R.string.stay_keys_error_generic)
            } finally {
                isSubmitting = false
            }
        }
    }
}

@Composable
fun StayWithKeysDialog(
    listingId: String,
    availableFrom: String,
    availableTo: String,
    minStayDays: Int,
    maxStayDays: Int,
    onDismiss: () -> Unit,
    onRequested: () -> Unit,
    vm: StayWithKeysViewModel = hiltViewModel(),
) {
    LaunchedEffect(listingId) { vm.load(listingId) }

    var from by remember { mutableStateOf(availableFrom.take(10)) }
    var to by remember {
        mutableStateOf(
            runCatching {
                LocalDate.parse(availableFrom.take(10)).plusDays(maxOf(minStayDays, 1).toLong()).toString()
            }.getOrElse { availableFrom.take(10) },
        )
    }

    // Whole nights between the two chosen dates.
    val nights = remember(from, to) {
        runCatching {
            ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to)).toInt()
        }.getOrDefault(0).coerceAtLeast(0)
    }
    val nightlyKeys = vm.availability?.nightlyKeys ?: 0
    val totalKeys = nightlyKeys * nights
    val balance = vm.balance
    val canAfford = balance == null || balance >= totalKeys
    val validNights = nights >= maxOf(minStayDays, 1) && nights <= maxStayDays
    val canSubmit = validNights && canAfford && !vm.isSubmitting

    // Success → bubble up so the listing screen can dismiss + point to Trips.
    if (vm.requestedStayId != null) {
        LaunchedEffect(vm.requestedStayId) { onRequested() }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.stay_keys_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                // Distinguish this from "Propose swap": one-way, no hosting back.
                Text(
                    stringResource(R.string.stay_keys_intro),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text(
                    stringResource(R.string.stay_keys_window, availableFrom.take(10), availableTo.take(10), minStayDays, maxStayDays),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                // Tap-to-pick on the real availability grid (DOK-159): booked
                // ranges and out-of-window days are disabled, so the guest can
                // never request dates the home isn't free. Falls back to the
                // published window until /keys-availability resolves.
                val avail = vm.availability
                val unavailable = remember(avail) {
                    avail?.bookedRanges?.map {
                        CalendarUnavailable(
                            from = parseCalendarDate(it.dateFrom),
                            to = parseCalendarDate(it.dateTo),
                            source = "keys_stay",
                        )
                    } ?: emptyList()
                }
                AvailabilityCalendar(
                    windowStart = parseCalendarDate(availableFrom),
                    windowEnd = parseCalendarDate(availableTo),
                    unavailable = unavailable,
                    selectedStart = runCatching { LocalDate.parse(from) }.getOrNull(),
                    selectedEnd = runCatching { LocalDate.parse(to) }.getOrNull(),
                    onSelect = { s, e ->
                        from = s.toString()
                        to = (e ?: s).toString()
                    },
                    minNights = maxOf(minStayDays, 1),
                    maxNights = maxStayDays,
                )

                CostRow(stringResource(R.string.stay_keys_points_per_night), nightlyKeys.toString())
                CostRow(stringResource(R.string.stay_keys_nights), nights.toString())
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.stay_keys_total), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(
                        stringResource(R.string.stay_keys_total_points, totalKeys),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }

                balance?.let { b ->
                    // Affordable: give the balance a scale ("= ~N nights here").
                    // Short: turn the gap into a concrete next step — how many
                    // nights of hosting close it — never an offer to buy.
                    val text = if (canAfford) {
                        val nightsCovered = if (nightlyKeys > 0) b / nightlyKeys else 0
                        pluralStringResource(R.plurals.stay_keys_enough, nightsCovered, b, nightsCovered)
                    } else {
                        val short = totalKeys - b
                        val hostNights = if (nightlyKeys > 0) (short + nightlyKeys - 1) / nightlyKeys else 0
                        pluralStringResource(R.plurals.stay_keys_short, hostNights, short, hostNights)
                    }
                    Text(
                        text,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (canAfford) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                    )
                }

                vm.loadError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                vm.requestError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

                Text(
                    stringResource(R.string.stay_keys_held_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSubmit && vm.availability != null,
                onClick = { vm.submit(listingId, from, to) },
            ) { Text(stringResource(if (vm.isSubmitting) R.string.stay_keys_sending else R.string.stay_keys_request)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}

@Composable
private fun CostRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}
