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

// Every package item is individually toggleable via PATCH …/items (DOK-148):
// the server payload stores { id, selected } alongside the item fields.

@Serializable
data class InspireExperienceItem(
    val id: String,
    val selected: Boolean = true,
    val city: String = "",
    val country: String = "",
    val title: String,
    /** Partner slug, e.g. "getyourguide". */
    val partner: String = "",
    /** Relative /api/affiliate/{partner}?… — resolve via AssistantRepository.resolveUrl. */
    val url: String,
    val photo: DiscoverCityPhoto? = null,
) {
    val partnerDisplayName: String
        get() = when (partner) {
            "getyourguide" -> "GetYourGuide"
            "skyscanner" -> "Skyscanner"
            "airalo" -> "Airalo"
            "battleface" -> "battleface"
            else -> partner.replaceFirstChar { it.uppercase() }
        }
}

@Serializable
data class InspireServiceItem(
    val id: String,
    val selected: Boolean = true,
    val slug: String,
    val name: String,
    /** flights | esim | insurance */
    val category: String,
    /** Relative /api/affiliate/{slug}?… — resolve via AssistantRepository.resolveUrl. */
    val url: String,
)

/**
 * A swapl concierge add-on offered inside the package — the ONLY payable
 * items (affiliate experiences/services stay external links, never charged
 * by us). Charged off-session only after the host accepts the proposal.
 */
@Serializable
data class InspireAddOnItem(
    val id: String,
    val selected: Boolean = true,
    val slug: String,
    val name: String,
    val description: String = "",
    val priceCents: Int = 0,
    val currency: String = "EUR",
    val provider: String = "",
    val category: String = "",
)

/**
 * What the assistant understood from the (possibly spoken) free-text prompt
 * — rendered as the "Understood: …" box, copy-aligned with web and iOS.
 */
@Serializable
data class InspireInterpreted(
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val city: String? = null,
    /** "pet-friendly" | "wfh" | "step-free" */
    val constraints: List<String>? = null,
    /** "ai" | "heuristic" */
    val source: String = "heuristic",
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
    val experiences: List<InspireExperienceItem> = emptyList(),
    val services: List<InspireServiceItem> = emptyList(),
    val addOns: List<InspireAddOnItem> = emptyList(),
    val interpreted: InspireInterpreted? = null,
    val source: String = "",
) {
    /** Destination first, then the real alternatives — the hero pick can be
     *  swapped to any of these without another network call. */
    val allCandidates: List<InspireCandidate> get() = listOf(destination) + alternatives
}
