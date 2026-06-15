package app.swapl.core.model

import kotlinx.serialization.Serializable

// Per-listing availability calendar (DOK-159). Mirrors the web API in
// app/app/api/listings/[id]/calendar (public snapshot) and
// app/app/api/listings/[id]/blocked-ranges (owner-managed host blocks), and the
// shared lib/listing/availability.ts result shape. A listing's bookable time is
// its published window [availableFrom, availableTo] MINUS every occupied range.
// Ranges are half-open [from, to): the checkout day frees up for the next guest.

// GET /api/listings/{id}/calendar — public availability snapshot for the
// date-picker. Anyone viewing the listing sees which dates are taken; each
// booked range is labelled with its source so clients can colour them.
@Serializable
data class ListingCalendar(
    val listingId: String,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val bookedRanges: List<CalendarRange> = emptyList(),
)

@Serializable
data class CalendarRange(
    val dateFrom: String,
    val dateTo: String,
    // Why the range is unavailable: agreement | keys_stay | blocked.
    val source: String = "blocked",
)

// GET /api/listings/{id}/blocked-ranges — owner-only list of host blocks (with
// notes). The public /calendar endpoint folds these into bookedRanges.
@Serializable
data class BlockedRangesResponse(val ranges: List<BlockedRange> = emptyList())

@Serializable
data class BlockedRange(
    val id: String,
    val dateFrom: String,
    val dateTo: String,
    val note: String? = null,
    val createdAt: String,
)

// POST /api/listings/{id}/blocked-ranges — block a date range. Owner-only.
@Serializable
data class BlockRangeRequest(
    val dateFrom: String,
    val dateTo: String,
    val note: String? = null,
)

@Serializable
data class BlockRangeResponse(
    val ok: Boolean = false,
    val range: BlockedRange,
)

// DELETE /api/listings/{id}/blocked-ranges — unblock a range by id.
@Serializable
data class UnblockRangeRequest(val rangeId: String)

@Serializable
data class OkResponse(val ok: Boolean = false)
