package app.swapl.core.model

import kotlinx.serialization.Serializable

// Saved travel windows (DOK-161): a member's "I want to travel around these
// dates" intents. The AI turns each into ready-made swap proposals — real,
// available, date-compatible homes — and the digest cron watches for new
// compatible homes. Mirrors the DTO from app/app/api/travel-windows/route.ts
// and ios/Swapl/Core/Models/TravelWindow.swift.
@Serializable
data class TravelWindow(
    val id: String,
    val dateFrom: String,   // yyyy-MM-dd
    val dateTo: String,
    val flexible: Boolean = false,
    val destinations: List<String> = emptyList(),
    val notes: String? = null,
    /** ISO string — kept raw. */
    val createdAt: String,
)

// The list envelope: { items: [...] }.
@Serializable
data class TravelWindowList(
    val items: List<TravelWindow> = emptyList(),
)

// POST body for create. Empty destinations / blank notes are sent as null by
// the repository so the server stores them as absent.
@Serializable
data class TravelWindowCreateBody(
    val dateFrom: String,   // yyyy-MM-dd
    val dateTo: String,
    val flexible: Boolean,
    val destinations: List<String>? = null,
    val notes: String? = null,
)

@Serializable
data class TravelWindowCreateResponse(
    val ok: Boolean = false,
    val window: TravelWindow,
)

// One AI-composed proposal for a window: a real, active, date-compatible home
// ranked by match score + travel profile, annotated with the swap modes it
// supports. Mirrors WindowProposal in app/lib/ai/window-proposals.ts and the
// iOS WindowProposal struct.
@Serializable
data class WindowProposal(
    val listingId: String,
    val title: String,
    val city: String,
    val country: String = "",
    val photo: String? = null,
    val matchScore: Int = 0,
    val modes: WindowProposalModes = WindowProposalModes(),
    val nightlyKeys: Int? = null,
    /** Short, data-grounded reason this home fits the window. */
    val why: String = "",
    /** True when the home also sits in one of the window's preferred destinations. */
    val matchesDestination: Boolean = false,
) {
    val locationText: String get() = if (country.isEmpty()) city else "$city, $country"
}

@Serializable
data class WindowProposalModes(
    /** Direct home-for-home swap — always available for a real, free home. */
    val directSwap: Boolean = false,
    /** Stay-with-Keys — only when the host listed a per-night Keys value. */
    val keysStay: Boolean = false,
)

@Serializable
data class WindowProposalDates(
    val from: String,
    val to: String,
    val flexible: Boolean = false,
)

@Serializable
data class WindowProposalsResult(
    val windowId: String,
    val dates: WindowProposalDates,
    val destinations: List<String> = emptyList(),
    val proposals: List<WindowProposal> = emptyList(),
)
