package app.swapl.core.model

import kotlinx.serialization.Serializable
import java.text.NumberFormat
import java.util.Currency

// Mirrors lib/discover.ts (and the iOS DiscoverRepository models) — the
// env-gated affiliate catalogue behind Explore's Experiences/Services tabs.

@Serializable
data class DiscoverServicesResponse(val items: List<DiscoverService> = emptyList())

@Serializable
data class DiscoverService(
    val slug: String,
    val name: String,
    /** flights | esim | experiences | insurance | concierge | … */
    val category: String,
    val tagline: String,
    /** Click-through via /api/affiliate/{partner}; null for concierge add-ons. */
    val url: String? = null,
    val iconHint: String = "sparkles",
    /** Real catalogue price — only for concierge add-ons, never invented. */
    val priceCents: Int? = null,
    val currency: String? = null,
) {
    // Partner slugs and add-on slugs live in different namespaces server-side;
    // scope the key by category so an accidental collision can't break LazyColumn keys.
    val key: String get() = "$category|$slug"

    val isConcierge: Boolean get() = category == "concierge"

    val formattedPrice: String?
        get() {
            // Affiliate add-ons seed priceCents 0 — suppress, never show an invented €0,00
            // (the web does the same with `priceCents > 0`).
            val cents = priceCents?.takeIf { it > 0 } ?: return null
            val code = currency ?: return null
            return runCatching {
                NumberFormat.getCurrencyInstance().apply {
                    this.currency = Currency.getInstance(code)
                }.format(cents / 100.0)
            }.getOrNull()
        }
}

@Serializable
data class DiscoverExperiencesResponse(val items: List<DiscoverExperience> = emptyList())

@Serializable
data class DiscoverExperience(
    val city: String,
    val country: String,
    val title: String,
    /** Partner slug, e.g. "getyourguide". */
    val partner: String,
    /** Click-through via /api/affiliate/{partner} with the city query. */
    val url: String,
    /** Cached CityMedia photo; null → client renders its city illustration. */
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

/** Subset of the CityPhoto shape (lib/city-media/types.ts) the app needs. */
@Serializable
data class DiscoverCityPhoto(
    val url: String,
    val width: Int = 0,
    val height: Int = 0,
    val alt: String = "",
    val photographer: String? = null,
    val sourceUrl: String? = null,
    val provider: String = "",
)
