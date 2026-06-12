package app.swapl.core.model

import kotlinx.serialization.Serializable

// Mirrors lib/ai/travel-profile.ts and lib/ai/inspire.ts (and the iOS
// AssistantRepository models) — the AI assistant surface (DOK-146).
//
// Privacy-first: the travel profile is synthesised ONLY from in-app signals
// (interests, favorites, saved searches, swap messages); the user can read it
// verbatim, refresh it, and delete it. The server degrades without an AI key
// (deterministic composition), so these shapes are always answered.

@Serializable
data class TravelTraits(
    val themes: List<String> = emptyList(),
    val cities: List<String> = emptyList(),
    val vibe: String? = null,
    val constraints: List<String> = emptyList(),
)

@Serializable
data class TravelProfile(
    val summary: String,
    val traits: TravelTraits = TravelTraits(),
    /** e.g. ["interests", "favorites", "saved_searches", "swap_messages"]. */
    val sourcesUsed: List<String> = emptyList(),
    /** ISO string with fractional seconds — kept raw for display. */
    val updatedAt: String = "",
)

@Serializable
data class InspireCandidate(
    val listingId: String,
    val city: String,
    val country: String,
    val title: String,
    val photo: String? = null,
    val matchScore: Int,
    /** Present only on the package destination ("why this fits you"). */
    val why: String? = null,
)

@Serializable
data class InspireDates(
    /** yyyy-MM-dd */
    val from: String,
    val to: String,
    /** "user" (explicit dates) or "availability" (from the user's listing). */
    val source: String = "user",
)

@Serializable
data class InspireService(
    val slug: String,
    val name: String,
    /** flights | esim | insurance */
    val category: String,
    /** Relative /api/affiliate/{slug}?… — resolve via AssistantRepository.resolveUrl. */
    val url: String,
)

@Serializable
data class InspirePackage(
    val packageId: String,
    val myListingId: String,
    val destination: InspireCandidate,
    val alternatives: List<InspireCandidate> = emptyList(),
    val dates: InspireDates,
    val proposalMessage: String,
    /** "ai" | "fallback" — whether the draft came from the LLM or the template. */
    val proposalMessageSource: String = "fallback",
    val experiences: List<DiscoverExperience> = emptyList(),
    val services: List<InspireService> = emptyList(),
    val source: String = "",
) {
    /** Destination first, then the real alternatives — the hero pick can be
     *  swapped to any of these without another network call. */
    val allCandidates: List<InspireCandidate> get() = listOf(destination) + alternatives
}
