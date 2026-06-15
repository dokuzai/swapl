package app.swapl.core.model

import kotlinx.serialization.Serializable

// "Your Swapl story" (DOK-158). Mirrors the web/iOS GET /api/me/story payload
// exactly so the same backend serves every client. The story is built only from
// real, COMPLETED swaps and completed Keys stays — never speculative data. Each
// completed mutual swap emits one trip (the other party's city) and one hosting
// (the caller's own city); a Keys stay emits a trip for the guest and a hosting
// for the host, both in the listing's city.
@Serializable
data class SwaplStory(
    val timeline: List<StoryEvent> = emptyList(),
    val counts: StoryCounts = StoryCounts(),
    val share: StoryShare,
) {
    val isEmpty: Boolean get() = timeline.isEmpty()
}

@Serializable
data class StoryEvent(
    // "trip" (the caller stayed somewhere) | "hosting" (the caller welcomed a guest).
    val kind: String,
    val city: String,
    val country: String,
    // ISO-8601 instants; we only ever render the year, so parsing stays cheap.
    val dateFrom: String,
    val dateTo: String,
    val year: Int,
    // The other party's display name, when known.
    val counterpartName: String? = null,
    // The listing involved, when known (e.g. a Keys stay).
    val listingTitle: String? = null,
) {
    val isTrip: Boolean get() = kind == "trip"
    val isHosting: Boolean get() = kind == "hosting"
}

@Serializable
data class StoryCounts(
    val trips: Int = 0,
    val hostings: Int = 0,
    // Distinct city|country pairs across the whole timeline.
    val cities: Int = 0,
    // Distinct countries across the whole timeline.
    val countries: Int = 0,
)

@Serializable
data class StoryShare(
    val referralCode: String,
    // Server-built referral URL. The client rebuilds an off-device link from
    // referralCode (same ?ref=CODE schema used elsewhere) so the shared card
    // always works, even when the API returns a localhost URL in dev.
    val referralUrl: String,
)
