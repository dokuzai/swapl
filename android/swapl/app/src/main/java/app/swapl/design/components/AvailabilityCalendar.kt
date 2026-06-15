package app.swapl.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.swapl.designtokens.SwaplSpacing
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

// THE shared availability month-grid (DOK-159). One component drives every
// surface that picks dates against a listing's real availability — the browse
// date filter, the Stay-with-Keys check-in/out picker, and the owner's calendar
// editor. It greys out anything outside the published window and any occupied
// range, so a member can never select dates the home isn't free.
//
// Availability rules live server-side (lib/listing/availability.ts → /calendar);
// this component only renders what the API already computed. Dates are handled
// as LocalDate; ranges are half-open [from, to) — the checkout day is bookable
// again. minNights/maxNights gate range completion for booking surfaces; the
// editor passes 1/Int.MAX_VALUE so any span can be blocked.

// A contiguous span of unavailable days, with a reason for colouring.
data class CalendarUnavailable(
    val from: LocalDate,
    val to: LocalDate, // exclusive
    val source: String, // agreement | keys_stay | blocked
)

@Composable
fun AvailabilityCalendar(
    windowStart: LocalDate,
    windowEnd: LocalDate, // exclusive: last bookable check-in is windowEnd - 1
    unavailable: List<CalendarUnavailable>,
    selectedStart: LocalDate?,
    selectedEnd: LocalDate?,
    onSelect: (start: LocalDate, end: LocalDate?) -> Unit,
    modifier: Modifier = Modifier,
    minNights: Int = 1,
    maxNights: Int = Int.MAX_VALUE,
) {
    val today = remember0()
    // Never offer dates in the past even if the window opens earlier.
    val firstSelectable = maxOf(windowStart, today)

    val isUnavailable: (LocalDate) -> Boolean = { day ->
        unavailable.any { !day.isBefore(it.from) && day.isBefore(it.to) }
    }
    val isOutsideWindow: (LocalDate) -> Boolean = { day ->
        day.isBefore(firstSelectable) || !day.isBefore(windowEnd)
    }
    // A whole [start, end) span must be free for a booking to land on it.
    val spanIsFree: (LocalDate, LocalDate) -> Boolean = { s, e ->
        var ok = true
        var d = s
        while (d.isBefore(e)) {
            if (isUnavailable(d) || isOutsideWindow(d)) { ok = false; break }
            d = d.plusDays(1)
        }
        ok
    }

    val months = remember(windowStart, windowEnd) {
        buildList {
            var ym = YearMonth.from(firstSelectable)
            val lastYm = YearMonth.from(windowEnd.minusDays(1))
            while (!ym.isAfter(lastYm)) {
                add(ym)
                ym = ym.plusMonths(1)
            }
        }
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
        WeekdayHeader()
        months.forEach { ym ->
            MonthGrid(
                ym = ym,
                inWindow = { !isOutsideWindow(it) },
                unavailable = isUnavailable,
                selectedStart = selectedStart,
                selectedEnd = selectedEnd,
                onTap = { day ->
                    handleTap(
                        day = day,
                        selectedStart = selectedStart,
                        selectedEnd = selectedEnd,
                        minNights = minNights,
                        maxNights = maxNights,
                        spanIsFree = spanIsFree,
                        onSelect = onSelect,
                    )
                },
            )
        }
    }
}

// Tap logic for range selection:
//  - no start, or a complete [start,end] already chosen → begin a new range.
//  - a start but no end:
//      • tapping the same/earlier day, or a day that would make an invalid /
//        unavailable span → restart at the new day.
//      • otherwise close the range on the tapped day (exclusive checkout).
private fun handleTap(
    day: LocalDate,
    selectedStart: LocalDate?,
    selectedEnd: LocalDate?,
    minNights: Int,
    maxNights: Int,
    spanIsFree: (LocalDate, LocalDate) -> Boolean,
    onSelect: (LocalDate, LocalDate?) -> Unit,
) {
    if (selectedStart == null || selectedEnd != null) {
        onSelect(day, null)
        return
    }
    if (!day.isAfter(selectedStart)) {
        onSelect(day, null)
        return
    }
    val nights = java.time.temporal.ChronoUnit.DAYS.between(selectedStart, day).toInt()
    if (nights < minNights || nights > maxNights || !spanIsFree(selectedStart, day)) {
        // Can't complete a valid stay here — treat as a fresh start instead.
        onSelect(day, null)
        return
    }
    onSelect(selectedStart, day)
}

@Composable
private fun WeekdayHeader() {
    // Monday-first, matching the web calendar.
    val labels = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    Row(Modifier.fillMaxWidth()) {
        labels.forEach { l ->
            Text(
                l,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MonthGrid(
    ym: YearMonth,
    inWindow: (LocalDate) -> Boolean,
    unavailable: (LocalDate) -> Boolean,
    selectedStart: LocalDate?,
    selectedEnd: LocalDate?,
    onTap: (LocalDate) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
        Text(
            "${ym.month.getDisplayName(TextStyle.FULL, Locale.getDefault()).replaceFirstChar { it.uppercase() }} ${ym.year}",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        val first = ym.atDay(1)
        // Monday = 0 … Sunday = 6 leading blanks.
        val lead = (first.dayOfWeek.value + 6) % 7
        val daysInMonth = ym.lengthOfMonth()
        val cells = lead + daysInMonth
        val rows = (cells + 6) / 7

        for (r in 0 until rows) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                for (c in 0 until 7) {
                    val cellIndex = r * 7 + c
                    val dayNum = cellIndex - lead + 1
                    if (dayNum < 1 || dayNum > daysInMonth) {
                        Box(Modifier.weight(1f).aspectRatio(1f))
                    } else {
                        val day = ym.atDay(dayNum)
                        DayCell(
                            day = day,
                            enabled = inWindow(day) && !unavailable(day),
                            blocked = unavailable(day),
                            selectedStart = selectedStart,
                            selectedEnd = selectedEnd,
                            onTap = onTap,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    enabled: Boolean,
    blocked: Boolean,
    selectedStart: LocalDate?,
    selectedEnd: LocalDate?,
    onTap: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val isStart = day == selectedStart
    val isEnd = day == selectedEnd
    val inRange = selectedStart != null && selectedEnd != null &&
        day.isAfter(selectedStart) && day.isBefore(selectedEnd)
    val isEndpoint = isStart || isEnd

    val bg = when {
        isEndpoint -> scheme.primary
        inRange -> scheme.primary.copy(alpha = 0.18f)
        else -> Color.Transparent
    }
    val fg = when {
        isEndpoint -> scheme.onPrimary
        !enabled -> scheme.onSurfaceVariant.copy(alpha = 0.38f)
        else -> scheme.onSurface
    }

    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .then(if (enabled) Modifier.clickable { onTap(day) } else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                day.dayOfMonth.toString(),
                style = MaterialTheme.typography.bodyMedium,
                color = fg,
                // A strike-through cue for occupied days helps colourblind users
                // beyond the dimmed colour alone.
                textDecoration = if (blocked) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
            )
        }
    }
}

// Tiny indirection so the composable stays previewable/testable; `LocalDate.now`
// is read once per composition.
@Composable
private fun remember0(): LocalDate = androidx.compose.runtime.remember { LocalDate.now() }

// Expand the API's booked ranges (ISO datetime strings) into the calendar's
// LocalDate spans. Tolerates both "YYYY-MM-DD" and full ISO datetimes.
fun parseCalendarDate(iso: String): LocalDate =
    runCatching { LocalDate.parse(iso.take(10)) }.getOrElse { LocalDate.now() }
