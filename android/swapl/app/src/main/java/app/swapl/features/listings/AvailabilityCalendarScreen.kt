package app.swapl.features.listings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.R
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.BlockedRange
import app.swapl.core.model.CalendarRange
import app.swapl.core.model.ListingCalendar
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.AvailabilityCalendar
import app.swapl.design.components.CalendarUnavailable
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.parseCalendarDate
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject

// Owner's availability calendar editor (DOK-159). The speculative mirror of the
// browse/booking date-picker: here the host SEES what's booked (swaps + Keys
// stays, read-only) and BLOCKS/UNBLOCKS their own dates. Blocks subtract from
// the bookable window server-side, so they immediately stop showing up in
// browse and Stay-with-Keys for guests.
@HiltViewModel
class AvailabilityCalendarViewModel @Inject constructor(
    private val repo: ListingRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val listingId: String = checkNotNull(savedState["listingId"])

    var calendar by mutableStateOf<ListingCalendar?>(null); private set
    var hostBlocks by mutableStateOf<List<BlockedRange>>(emptyList()); private set
    var isLoading by mutableStateOf(true); private set
    var error by mutableStateOf<String?>(null); private set
    var isSaving by mutableStateOf(false); private set

    // The host's in-progress block selection on the grid.
    var selStart by mutableStateOf<LocalDate?>(null)
    var selEnd by mutableStateOf<LocalDate?>(null)

    fun load() = viewModelScope.launch {
        isLoading = true; error = null
        try {
            // /calendar is the public truth (window + every occupied range);
            // /blocked-ranges gives the owner the unblock handles + notes.
            calendar = repo.calendar(listingId)
            hostBlocks = repo.blockedRanges(listingId).ranges
        } catch (t: Throwable) {
            error = t.message ?: "Couldn't load your calendar."
        } finally {
            isLoading = false
        }
    }

    fun select(start: LocalDate, end: LocalDate?) {
        selStart = start
        selEnd = end
    }

    fun clearSelection() {
        selStart = null
        selEnd = null
    }

    fun blockSelection() {
        val s = selStart
        val e = selEnd
        if (s == null || e == null || isSaving) return
        viewModelScope.launch {
            isSaving = true; error = null
            try {
                repo.blockRange(
                    listingId,
                    dateFrom = "${s}T00:00:00.000Z",
                    dateTo = "${e}T00:00:00.000Z",
                )
                clearSelection()
                load()
            } catch (t: Throwable) {
                error = t.message ?: "Couldn't block those dates."
            } finally {
                isSaving = false
            }
        }
    }

    fun unblock(rangeId: String) {
        if (isSaving) return
        viewModelScope.launch {
            isSaving = true; error = null
            try {
                repo.unblockRange(listingId, rangeId)
                load()
            } catch (t: Throwable) {
                error = t.message ?: "Couldn't unblock those dates."
            } finally {
                isSaving = false
            }
        }
    }
}

@Composable
fun AvailabilityCalendarScreen(
    onDone: () -> Unit = {},
    vm: AvailabilityCalendarViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }

    if (vm.isLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val cal = vm.calendar ?: run {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(vm.error ?: "Calendar unavailable", color = MaterialTheme.colorScheme.error)
        }
        return
    }

    val windowStart = parseCalendarDate(cal.availableFrom)
    val windowEnd = parseCalendarDate(cal.availableTo)
    val unavailable = cal.bookedRanges.map { it.toUnavailable() }
    // The host's own blocks are the only ones that can be lifted from here.
    val blockSpans = cal.bookedRanges.filter { it.source == "blocked" }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text(stringResource(R.string.calendar_title), style = MaterialTheme.typography.displaySmall)
        Text(
            stringResource(R.string.calendar_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        LegendRow()

        AvailabilityCalendar(
            windowStart = windowStart,
            windowEnd = windowEnd,
            unavailable = unavailable,
            selectedStart = vm.selStart,
            selectedEnd = vm.selEnd,
            onSelect = { s, e -> vm.select(s, e) },
            // The editor can block any span ≥ 1 night.
            minNights = 1,
            maxNights = Int.MAX_VALUE,
        )

        val s = vm.selStart
        val e = vm.selEnd
        if (s != null && e != null) {
            val nights = ChronoUnit.DAYS.between(s, e).toInt()
            SurfaceCard {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    Text(
                        stringResource(
                            R.string.calendar_block_summary,
                            s.toString(),
                            e.toString(),
                            pluralStringResource(R.plurals.nights_count, nights, nights),
                        ),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        OutlinedButton(onClick = { vm.clearSelection() }, shape = CircleShape) { Text(stringResource(R.string.calendar_clear)) }
                        PrimaryPill(
                            text = if (vm.isSaving) stringResource(R.string.calendar_blocking) else stringResource(R.string.calendar_block_dates),
                            onClick = { vm.blockSelection() },
                            enabled = !vm.isSaving,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        } else if (s != null) {
            Text(
                stringResource(R.string.calendar_pick_checkout),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        if (blockSpans.isNotEmpty()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            KickerLabel(stringResource(R.string.calendar_blocked_label))
            // Match each visible block span to its owner range id so it can be
            // lifted. The /blocked-ranges list carries the ids + notes.
            vm.hostBlocks.forEach { block ->
                BlockedRangeRow(
                    block = block,
                    enabled = !vm.isSaving,
                    onUnblock = { vm.unblock(block.id) },
                )
            }
        }

        Spacer(Modifier.height(SwaplSpacing.s2))
        OutlinedButton(onClick = onDone, shape = CircleShape, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.common_done))
        }
    }
}

@Composable
private fun BlockedRangeRow(block: BlockedRange, enabled: Boolean, onUnblock: () -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
    ) {
        Icon(Icons.Default.Block, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "${block.dateFrom.take(10)} → ${block.dateTo.take(10)}",
                style = MaterialTheme.typography.bodyMedium,
            )
            block.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        IconButton(onClick = onUnblock, enabled = enabled) {
            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.calendar_unblock), tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun LegendRow() {
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
        LegendDot(MaterialTheme.colorScheme.primary, stringResource(R.string.calendar_legend_selected))
        LegendDot(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f), stringResource(R.string.calendar_legend_booked))
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
        Box(Modifier.size(12.dp).background(color, CircleShape))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun CalendarRange.toUnavailable(): CalendarUnavailable =
    CalendarUnavailable(
        from = parseCalendarDate(dateFrom),
        to = parseCalendarDate(dateTo),
        source = source,
    )
