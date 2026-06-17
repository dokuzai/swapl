package app.swapl.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Listing(
    val id: String,
    val userId: String,
    val ownerName: String? = null,
    val title: String,
    val description: String,
    val propertyType: String,
    val city: String,
    val neighbourhood: String,
    val country: String,
    val address: String? = null,
    // Fuzzed to a ~2km area for non-owners server-side; used for the approximate
    // location map on the detail screen.
    val lat: Double? = null,
    val lng: Double? = null,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val floor: Int? = null,
    val petsAllowed: Boolean,
    val petTypes: List<String> = emptyList(),
    val wfhSetup: Boolean,
    val wfhDesks: Int = 0,
    val stepFreeAccess: Boolean,
    val hasElevator: Boolean,
    val hasParking: Boolean = false,
    val bikeIncluded: Boolean = false,
    val balcony: Boolean,
    val rooftop: Boolean,
    val garden: Boolean,
    val courtyard: Boolean = false,
    val piano: Boolean = false,
    val pool: Boolean,
    val gym: Boolean = false,
    val ac: Boolean,
    val washer: Boolean,
    val dryer: Boolean,
    val dishwasher: Boolean,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val photos: List<String>,
    val tags: List<String>,
    val palette: String,
    val isFeatured: Boolean,
    val isVerified: Boolean,
    // Owner-proof trust badge (DOK-162): host attested + admin-approved.
    // Optional, never a publish gate — defaults false for older payloads.
    val ownerVerified: Boolean = false,
    // Unified valuation v2 (DOK-163). All persisted server-side and read from
    // the DTO — the client NEVER recomputes nightlyKeys. Optional so the app
    // still decodes responses from older deploys.
    // "entire_place" | "private_room".
    val spaceType: String = "entire_place",
    val roomsOffered: Int? = null,
    // Persisted final nightly value (base × (1 + review adjustment)). Null until
    // the valuation cron has run for this listing.
    val nightlyKeys: Int? = null,
    val locationTier: Int? = null,
    // Owner-only structured breakdown of how nightlyKeys is calculated. Null for
    // non-owners (the server withholds it) and on older deploys.
    val valuationExplanation: ValuationExplanation? = null,
) {
    val isPrivateRoom: Boolean get() = spaceType == "private_room"
}

// Mirrors lib/keys/valuation.ts ValuationExplanation (version 2) — the
// owner-only "how your nightly Keys are calculated" payload exposed on
// GET /api/listings/{id}. The client only renders this; it never recomputes it.
@Serializable
data class ValuationExplanation(
    val version: Int = 2,
    // Pre-feedback nightly Keys built from the deterministic factors below.
    val base: Int,
    // Review-feedback multiplier, clamped to ±0.20. Positive nudges the value up.
    val adjustment: Float = 0f,
    // Final = clamp(round(base × (1 + adjustment))).
    val nightlyKeys: Int,
    val locationTier: Int,
    val spaceType: String,
    // < 1.0 for a private room (the value reflects only the room).
    val roomsCoefficient: Float = 1f,
    val factors: List<ValuationFactor> = emptyList(),
    val ai: ValuationAi,
    val feedback: ValuationFeedback,
) {
    val isPrivateRoom: Boolean get() = spaceType == "private_room"
}

@Serializable
data class ValuationFactor(
    // base | size | sleeps | location_tier | verified | ai_appeal
    val key: String,
    val label: String,
    // Signed Keys contribution of this factor.
    val points: Float,
)

@Serializable
data class ValuationAi(
    val source: String,   // "ai" | "fallback"
    val bonus: Float = 0f,
    val summary: String = "",
)

@Serializable
data class ValuationFeedback(
    val reviewCount: Int = 0,
    val avgRating: Float? = null,
    // False until enough reviews exist for the adjustment to apply.
    val applied: Boolean = false,
)

// Request body for POST /api/listings and PUT /api/listings/{id}.
// Matches lib/validators.ts listingCreateSchema exactly.
@Serializable
data class ListingCreateBody(
    val title: String,
    val description: String,
    val propertyType: String,
    val city: String,
    val neighbourhood: String,
    val country: String,
    val address: String? = null,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val floor: Int? = null,
    val hasElevator: Boolean = false,
    val stepFreeAccess: Boolean = false,
    val petsAllowed: Boolean = false,
    val petTypes: List<String> = emptyList(),
    val wfhSetup: Boolean = false,
    val wfhDesks: Int = 0,
    val hasParking: Boolean = false,
    val bikeIncluded: Boolean = false,
    val rooftop: Boolean = false,
    val balcony: Boolean = false,
    val garden: Boolean = false,
    val courtyard: Boolean = false,
    val piano: Boolean = false,
    val pool: Boolean = false,
    val gym: Boolean = false,
    val ac: Boolean = false,
    val dishwasher: Boolean = false,
    val washer: Boolean = false,
    val dryer: Boolean = false,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val photos: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    // Private-room / single-room swaps (DOK-160). "entire_place" |
    // "private_room"; on a private room the host offers a subset of the home and
    // the server reduces the nightly Keys accordingly. Defaults to entire place.
    val spaceType: String = "entire_place",
    // Rooms offered when spaceType == "private_room" (1–15). Omitted for an
    // entire place. Null is fine on the wire — server treats it as the default.
    val roomsOffered: Int? = null,
    // Publish acknowledgment (DOK-162). REQUIRED on create: the host
    // self-attests they have the right to host in the chosen `mode`. Ignored
    // on update. Missing/false on create -> 400 PUBLISH_ACK_REQUIRED.
    val ackAccepted: Boolean? = null,
    // "entire_home_while_away" | "room_or_host_present". REQUIRED on create
    // when ackAccepted is true.
    val mode: String? = null,
)

// `{ ok: true, id }` from POST /api/listings and PUT /api/listings/{id}.
@Serializable
data class ListingMutationResponse(val ok: Boolean, val id: String)

// `{ url }` from POST /api/uploads/listing-photo (multipart).
@Serializable
data class UploadResponse(val url: String)

@Serializable
data class ListingWithScore(
    val listing: Listing,
    val matchScore: Int? = null,
    val band: String,
)

@Serializable
data class ListingSearchResponse(
    val items: List<ListingWithScore>,
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val viewerListingId: String? = null,
)

@Serializable
data class Host(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val memberSince: String,
)

@Serializable
data class ListingDetailResponse(
    val listing: Listing,
    val host: Host,
    val matchScore: Int? = null,
    val viewerListingId: String? = null,
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String,
    val name: String? = null,
    val avatar: String? = null,
)

@Serializable
data class TokenResponse(
    val token: String,
    val expiresAt: String,
    val user: AuthUser,
)

@Serializable
data class ProposalSummary(
    val id: String,
    val status: String,
    val meSide: String,
    val dateFrom: String,
    val dateTo: String,
    val message: String? = null,
    val myCity: String,
    val myNeighbourhood: String,
    val myCoverPhotoUrl: String? = null,
    val theirCity: String,
    val theirNeighbourhood: String,
    val theirCoverPhotoUrl: String? = null,
    val otherName: String? = null,
    val updatedAt: String,
)

@Serializable
data class InboxBuckets(
    val waitingOnYou: List<ProposalSummary>,
    val sent: List<ProposalSummary>,
    val active: List<ProposalSummary>,
    val archived: List<ProposalSummary>,
)

@Serializable
data class InboxResponse(val buckets: InboxBuckets)

// ---------- proposal detail ----------

@Serializable
data class Proposal(
    val id: String,
    val status: String,
    val meSide: String,
    val dateFrom: String,
    val dateTo: String,
    val message: String? = null,
    val counterDateFrom: String? = null,
    val counterDateTo: String? = null,
    val counterMessage: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class OtherParty(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val verified: Boolean,
)

@Serializable
data class Insurance(
    val policyNumber: String,
    val coverageAmount: Int,
    val status: String,
    val expiresAt: String,
)

@Serializable
data class Agreement(
    val id: String,
    val dateFrom: String,
    val dateTo: String,
    val keyCode1: String? = null,
    val keyCode2: String? = null,
    val status: String,
    // True when the agreement is COMPLETED and the caller hasn't reviewed it
    // yet (DOK-147). Default null: older deploys omit the key.
    val canReview: Boolean? = null,
    val insurance: Insurance? = null,
)

@Serializable
data class ProposalDetail(
    val proposal: Proposal,
    val proposerListing: Listing,
    val targetListing: Listing,
    val other: OtherParty,
    val agreement: Agreement? = null,
)

// ---------- public profile ----------

@Serializable
data class PublicProfileUser(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val memberSince: String,
    val interests: List<String>,
    // Rich profile fields (DOK-147) — additive & optional so the app keeps
    // decoding responses from older deploys.
    val work: String? = null,
    val languages: List<String>? = null,
    // Privacy-gated server-side: null when the host hides their home city.
    val homeCity: String? = null,
    val homeCountry: String? = null,
)

@Serializable
data class ProfileStats(
    val swapsCompleted: Int,
    val reviewsCount: Int,
    val avgRating: Double? = null,
    val memberSince: String,
)

// One entry per city+year visited via a COMPLETED swap — real data only.
@Serializable
data class VisitedCity(
    val city: String,
    val country: String,
    val year: Int,
)

@Serializable
data class ProfileReviewAuthor(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
)

@Serializable
data class ProfileReview(
    val id: String,
    val author: ProfileReviewAuthor,
    val rating: Int,
    val text: String,
    val createdAt: String,
)

@Serializable
data class PublicProfile(
    val user: PublicProfileUser,
    val listings: List<Listing>,
    // DOK-147 additions — optional so older API deploys still decode.
    val stats: ProfileStats? = null,
    val visited: List<VisitedCity>? = null,
    val reviews: List<ProfileReview>? = null,
)

// ---------- interests catalog ----------

@Serializable
data class InterestTag(val slug: String, val label: String, val category: String)

@Serializable
data class InterestCategory(val id: String, val label: String)

@Serializable
data class InterestsCatalog(
    val catalog: List<InterestTag>,
    val categories: List<InterestCategory>,
    val selected: List<String>,
)

// ---------- saved searches ----------

@Serializable
data class SavedSearch(
    val id: String,
    val name: String,
    val query: String,
    val alertEnabled: Boolean,
    val createdAt: String,
)

@Serializable
data class SavedSearchesResponse(val items: List<SavedSearch>)

// ---------- favorites (wishlists) ----------

@Serializable
data class FavoritesResponse(val items: List<Listing>)

@Serializable
data class FavoriteIdsResponse(val ids: List<String>)

@Serializable
data class FavoriteToggleResponse(val ok: Boolean, val favorited: Boolean)

// ---------- me ----------

@Serializable
data class MeUser(
    val id: String,
    val email: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val role: String,
    val interests: List<String>,
    val createdAt: String,
    // Rich profile fields (DOK-147) — additive & optional.
    val work: String? = null,
    val languages: List<String>? = null,
    val homeCity: String? = null,
    val homeCountry: String? = null,
)

// GET/PATCH /api/profile/settings — privacy + notification toggles. The
// server merges partial PATCHes and always answers the full canonical shape.
@Serializable
data class UserSettings(
    val searchEngineIndexing: Boolean,
    val showHomeCity: Boolean,
    val emailNotifications: Boolean,
    val pushNotifications: Boolean,
)

@Serializable
data class MeCounts(
    val listings: Int,
    val incomingProposals: Int,
    val outgoingProposals: Int,
    val activeSwaps: Int,
)

@Serializable
data class MeSubscription(
    val planId: String,
    val status: String,
    val currentPeriodEnd: String,
    val cancelAtPeriodEnd: Boolean,
)

@Serializable
data class MeResponse(
    val user: MeUser,
    val counts: MeCounts,
    val subscription: MeSubscription? = null,
    // DOK-147 — caller's privacy/notification toggles; optional so the app
    // still decodes /api/me from older deploys.
    val settings: UserSettings? = null,
)

// ---------- admin metrics ----------

@Serializable
data class MetricsNow(
    val online: Int,
    val dau: Int,
    val wau: Int,
    val mau: Int,
)

@Serializable
data class MetricsUsers(
    val total: Int,
    val emailVerified: Int,
    val withActiveListing: Int,
    val new7d: Int,
    val new30d: Int,
)

@Serializable
data class MetricsListingDistribution(
    val zero: Int,
    val one: Int,
    val two: Int,
    val threePlus: Int,
)

@Serializable
data class MetricsTopUser(
    val id: String,
    val name: String? = null,
    val email: String,
    val listings: Int,
    val online: Boolean = false,
    val lastActiveAt: String? = null,
)

@Serializable
data class MetricsListingsPerUser(
    val distribution: MetricsListingDistribution,
    val avgPerUserWithListing: Double,
    val topUsers: List<MetricsTopUser>,
)

@Serializable
data class MetricsCity(
    val city: String,
    val listings: Int,
    val share: Double,
)

@Serializable
data class MetricsCities(
    val totalActiveListings: Int,
    val top: List<MetricsCity>,
)

@Serializable
data class MetricsEngagement(
    val proposalsByStatus: Map<String, Int>,
    val proposalsTotal: Int,
    val proposalAcceptRate: Double,
    val agreementsActive: Int,
    val agreementsCompleted: Int,
    val messagesTotal: Int,
    val messages7d: Int,
    val favoritesTotal: Int,
    val favorites7d: Int,
    val savedSearches: Int,
)

@Serializable
data class AdminMetrics(
    val now: MetricsNow,
    val users: MetricsUsers,
    val listingsPerUser: MetricsListingsPerUser,
    val cities: MetricsCities,
    val engagement: MetricsEngagement,
    val generatedAt: String,
)
